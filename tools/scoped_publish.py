from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


VERSION = 1
DEFAULT_REPO = "amrierscuo/Computational-Physics"
DEFAULT_BRANCH = "main"
SCOPES = {"math": "Args/Math/", "phy": "Args/Phy/"}
PROXY_KEYS = ("ALL_PROXY", "GIT_HTTP_PROXY", "GIT_HTTPS_PROXY", "HTTP_PROXY", "HTTPS_PROXY")
MAX_WORKERS = 8


def clean_env() -> dict[str, str]:
    env = os.environ.copy()
    for key in PROXY_KEYS:
        env.pop(key, None)
        env.pop(key.lower(), None)
    return env


def run(command: list[str], input_bytes: bytes | None = None) -> bytes:
    result = subprocess.run(command, input=input_bytes, capture_output=True, env=clean_env())
    if result.returncode:
        stderr = result.stderr.decode("utf-8", "replace")
        raise RuntimeError(f"Command failed: {' '.join(command)}\n{stderr}")
    return result.stdout


def gh(
    repo: str,
    method: str,
    endpoint: str,
    payload: dict[str, object] | None = None,
) -> dict[str, Any]:
    command = ["gh", "api", "--method", method, f"repos/{repo}/{endpoint}"]
    input_bytes = None
    if payload is not None:
        command.extend(["--input", "-"])
        input_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    raw = run(command, input_bytes)
    return json.loads(raw.decode("utf-8"))


def ref_sha(repo: str, branch: str) -> str:
    response = gh(repo, "GET", f"git/ref/heads/{branch}")
    return str(response["object"]["sha"])


def tree_at(repo: str, commit_sha: str) -> tuple[str, dict[str, dict[str, Any]]]:
    commit = gh(repo, "GET", f"git/commits/{commit_sha}")
    tree_sha = str(commit["tree"]["sha"])
    response = gh(repo, "GET", f"git/trees/{tree_sha}?recursive=1")
    if bool(response.get("truncated")):
        raise RuntimeError("Remote tree is truncated; publication is stopped")
    entries = {str(item["path"]): item for item in response["tree"]}
    return tree_sha, entries


def normalize_path(value: str) -> str:
    path = PurePosixPath(value.replace("\\", "/"))
    normalized = path.as_posix().lstrip("/")
    if not normalized or normalized == "." or ".." in path.parts:
        raise ValueError(f"Unsafe repository path: {value}")
    return normalized


def assert_scope(path: str, scope: str) -> None:
    prefix = SCOPES[scope]
    if not path.startswith(prefix) or path == prefix.rstrip("/"):
        raise ValueError(f"Path outside {scope} scope ({prefix}): {path}")


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest().upper()


def git_blob_sha(content: bytes) -> str:
    header = f"blob {len(content)}\0".encode("ascii")
    return hashlib.sha1(header + content).hexdigest()


def payload_file(root: Path, path: str) -> Path:
    return root / "files" / Path(*PurePosixPath(path).parts)


def read_paths(paths: Iterable[str], paths_file: str | None) -> list[str]:
    values = list(paths)
    if paths_file:
        for line in Path(paths_file).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                values.append(line)
    normalized = sorted({normalize_path(value) for value in values})
    if not normalized:
        raise ValueError("At least one --path or --paths-file entry is required")
    return normalized


def parallel_map(function, values: list[Any]) -> list[Any]:
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(values) or 1)) as pool:
        return list(pool.map(function, values))


def fetch_blob(repo: str, object_id: str) -> bytes:
    response = gh(repo, "GET", f"git/blobs/{object_id}")
    if str(response.get("encoding")) != "base64":
        raise RuntimeError(f"Unsupported blob encoding for {object_id}")
    return base64.b64decode(str(response["content"]).replace("\n", ""))


def create_blob(repo: str, content: bytes) -> str:
    response = gh(
        repo,
        "POST",
        "git/blobs",
        {"content": base64.b64encode(content).decode("ascii"), "encoding": "base64"},
    )
    return str(response["sha"])


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_manifest(payload_root: Path) -> dict[str, Any]:
    path = payload_root / "publish.json"
    if not path.is_file():
        raise FileNotFoundError(f"Payload manifest missing: {path}")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if int(manifest.get("version", 0)) != VERSION:
        raise ValueError(f"Unsupported payload version: {manifest.get('version')}")
    scope = str(manifest.get("scope"))
    if scope not in SCOPES:
        raise ValueError(f"Unsupported scope: {scope}")
    if str(manifest.get("allowed_prefix")) != SCOPES[scope]:
        raise ValueError("Manifest scope and allowed_prefix do not match")
    if not str(manifest.get("message", "")).strip():
        raise ValueError("Manifest commit message is empty")
    return manifest


def snapshot(args: argparse.Namespace) -> None:
    scope = args.scope
    paths = read_paths(args.path, args.paths_file)
    for path in paths:
        assert_scope(path, scope)
    new_paths = {normalize_path(path) for path in args.new_path}
    for path in new_paths:
        assert_scope(path, scope)
    if not new_paths.issubset(paths):
        raise ValueError("Every --new-path must also be listed with --path")

    output = Path(args.output).resolve()
    if output.exists():
        raise FileExistsError(f"Payload directory already exists: {output}")
    output.mkdir(parents=True)

    repo = args.repo
    branch = args.branch
    base_sha = ref_sha(repo, branch)
    _, tree = tree_at(repo, base_sha)
    existing: list[tuple[str, dict[str, Any]]] = []
    records: list[dict[str, object]] = []
    for path in paths:
        entry = tree.get(path)
        if path in new_paths:
            if entry is not None:
                raise ValueError(f"--new-path already exists remotely: {path}")
            records.append(
                {
                    "path": path,
                    "mode": "100644",
                    "base_blob": None,
                    "base_sha256": sha256(b""),
                }
            )
            continue
        if not entry or entry.get("type") != "blob":
            raise FileNotFoundError(f"Remote blob missing: {path}")
        existing.append((path, entry))

    def download(item: tuple[str, dict[str, Any]]) -> tuple[str, dict[str, Any], bytes]:
        path, entry = item
        return path, entry, fetch_blob(repo, str(entry["sha"]))

    downloaded = parallel_map(download, existing)
    for path, entry, content in downloaded:
        target = payload_file(output, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        records.append(
            {
                "path": path,
                "mode": str(entry.get("mode", "100644")),
                "base_blob": str(entry["sha"]),
                "base_sha256": sha256(content),
            }
        )
    for path in new_paths:
        target = payload_file(output, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"")

    manifest = {
        "version": VERSION,
        "repo": repo,
        "branch": branch,
        "scope": scope,
        "allowed_prefix": SCOPES[scope],
        "message": args.message,
        "created_base_sha": base_sha,
        "files": sorted(records, key=lambda item: str(item["path"])),
    }
    write_json(output / "publish.json", manifest)
    print(
        json.dumps(
            {
                "action": "snapshot",
                "payload": str(output),
                "scope": scope,
                "base_sha": base_sha,
                "files": len(records),
                "parallel_workers": min(MAX_WORKERS, len(existing) or 1),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def payload_state(payload_root: Path, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    scope = str(manifest["scope"])
    records = list(manifest.get("files", []))
    if not records:
        raise ValueError("Payload has no files")
    seen: set[str] = set()
    state: list[dict[str, Any]] = []
    for record in records:
        path = normalize_path(str(record["path"]))
        assert_scope(path, scope)
        if path in seen:
            raise ValueError(f"Duplicate payload path: {path}")
        seen.add(path)
        source = payload_file(payload_root, path)
        if not source.is_file():
            raise FileNotFoundError(f"Payload file missing: {source}")
        content = source.read_bytes()
        state.append(
            {
                "path": path,
                "mode": str(record.get("mode", "100644")),
                "base_blob": record.get("base_blob"),
                "base_sha256": str(record["base_sha256"]),
                "content": content,
                "sha256": sha256(content),
                "desired_blob": git_blob_sha(content),
                "changed_from_snapshot": sha256(content) != str(record["base_sha256"]),
            }
        )
    return state


def compare_remote(
    state: list[dict[str, Any]],
    tree: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    pending: list[dict[str, Any]] = []
    already: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for item in state:
        remote = tree.get(str(item["path"]))
        remote_blob = str(remote["sha"]) if remote and remote.get("type") == "blob" else None
        base_blob = item["base_blob"]
        if remote_blob == item["desired_blob"]:
            already.append(item)
        elif remote_blob == base_blob:
            pending.append(item)
        else:
            conflicts.append(
                {
                    "path": item["path"],
                    "base_blob": base_blob,
                    "remote_blob": remote_blob,
                    "desired_blob": item["desired_blob"],
                }
            )
    return pending, already, conflicts


def audit(payload_root: Path, require_changes: bool = True) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    manifest = load_manifest(payload_root)
    state = payload_state(payload_root, manifest)
    changed = [item for item in state if item["changed_from_snapshot"]]
    unchanged = [item for item in state if not item["changed_from_snapshot"]]
    if require_changes and not changed:
        raise ValueError("Payload contains no changes")
    repo = str(manifest["repo"])
    branch = str(manifest["branch"])
    latest_sha = ref_sha(repo, branch)
    _, tree = tree_at(repo, latest_sha)
    pending, already, conflicts = compare_remote(changed, tree)
    report = {
        "scope": manifest["scope"],
        "allowed_prefix": manifest["allowed_prefix"],
        "created_base_sha": manifest["created_base_sha"],
        "latest_remote_sha": latest_sha,
        "payload_files": len(state),
        "changed_files": len(changed),
        "unchanged_files": len(unchanged),
        "pending_files": len(pending),
        "already_applied_files": len(already),
        "conflicts": conflicts,
        "paths": [item["path"] for item in changed],
    }
    return manifest, changed, report


def check(args: argparse.Namespace) -> None:
    payload_root = Path(args.payload).resolve()
    _, _, report = audit(payload_root)
    print(json.dumps({"action": "check", **report}, ensure_ascii=False, indent=2))
    if report["conflicts"]:
        raise SystemExit(2)


def commit_files(repo: str, commit_sha: str) -> list[str]:
    paths: list[str] = []
    for page in range(1, 20):
        response = gh(repo, "GET", f"commits/{commit_sha}?per_page=100&page={page}")
        files = list(response.get("files", []))
        paths.extend(str(item["filename"]) for item in files)
        if len(files) < 100:
            break
    return sorted(set(paths))


def publish(args: argparse.Namespace) -> None:
    payload_root = Path(args.payload).resolve()
    manifest, changed, initial_report = audit(payload_root)
    if initial_report["conflicts"]:
        print(json.dumps({"action": "publish-blocked", **initial_report}, ensure_ascii=False, indent=2))
        raise SystemExit(2)

    repo = str(manifest["repo"])
    branch = str(manifest["branch"])

    def upload(item: dict[str, Any]) -> tuple[str, str]:
        remote_sha = create_blob(repo, bytes(item["content"]))
        if remote_sha != item["desired_blob"]:
            raise RuntimeError(f"Blob verification failed for {item['path']}")
        return str(item["path"]), remote_sha

    uploaded = dict(parallel_map(upload, changed))
    last_error = ""
    for attempt in range(1, args.retries + 1):
        parent_sha = ref_sha(repo, branch)
        parent_tree, tree = tree_at(repo, parent_sha)
        pending, already, conflicts = compare_remote(changed, tree)
        if conflicts:
            report = {**initial_report, "latest_remote_sha": parent_sha, "conflicts": conflicts}
            print(json.dumps({"action": "publish-blocked", **report}, ensure_ascii=False, indent=2))
            raise SystemExit(2)
        if not pending:
            print(
                json.dumps(
                    {
                        "action": "already-applied",
                        "scope": manifest["scope"],
                        "remote_sha": parent_sha,
                        "files": len(already),
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return

        tree_items = [
            {
                "path": item["path"],
                "mode": item["mode"],
                "type": "blob",
                "sha": uploaded[str(item["path"])],
            }
            for item in pending
        ]
        new_tree = gh(repo, "POST", "git/trees", {"base_tree": parent_tree, "tree": tree_items})
        new_commit = gh(
            repo,
            "POST",
            "git/commits",
            {
                "message": str(manifest["message"]),
                "tree": str(new_tree["sha"]),
                "parents": [parent_sha],
            },
        )
        commit_sha = str(new_commit["sha"])
        if ref_sha(repo, branch) != parent_sha:
            last_error = "remote moved before ref update"
            continue
        try:
            gh(
                repo,
                "PATCH",
                f"git/refs/heads/{branch}",
                {"sha": commit_sha, "force": False},
            )
        except RuntimeError as exc:
            last_error = str(exc)
            continue
        final_sha = ref_sha(repo, branch)
        if final_sha != commit_sha:
            last_error = f"remote verification failed: {final_sha} != {commit_sha}"
            continue
        published_paths = commit_files(repo, commit_sha)
        expected_paths = sorted(str(item["path"]) for item in pending)
        if published_paths != expected_paths:
            raise RuntimeError(
                f"Published path scope mismatch: expected {len(expected_paths)}, got {len(published_paths)}"
            )
        print(
            json.dumps(
                {
                    "action": "published",
                    "scope": manifest["scope"],
                    "parent_sha": parent_sha,
                    "commit_sha": commit_sha,
                    "commit_url": f"https://github.com/{repo}/commit/{commit_sha}",
                    "files": len(expected_paths),
                    "paths": expected_paths,
                    "rebase_attempt": attempt,
                    "concurrent_changes_skipped": len(already),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return
    raise RuntimeError(f"Could not fast-forward after {args.retries} attempts: {last_error}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Publish isolated Math or Phy payloads directly on the latest remote main"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    snap = subparsers.add_parser("snapshot", help="Create an isolated payload from remote main")
    snap.add_argument("--scope", choices=sorted(SCOPES), required=True)
    snap.add_argument("--output", required=True)
    snap.add_argument("--message", required=True)
    snap.add_argument("--repo", default=DEFAULT_REPO)
    snap.add_argument("--branch", default=DEFAULT_BRANCH)
    snap.add_argument("--path", action="append", default=[])
    snap.add_argument("--paths-file")
    snap.add_argument("--new-path", action="append", default=[])
    snap.set_defaults(handler=snapshot)

    verify = subparsers.add_parser("check", help="Validate scope and detect remote conflicts")
    verify.add_argument("payload")
    verify.set_defaults(handler=check)

    push = subparsers.add_parser("publish", help="Fast-forward the isolated payload onto remote main")
    push.add_argument("payload")
    push.add_argument("--retries", type=int, default=3)
    push.set_defaults(handler=publish)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        args.handler(args)
    except (FileExistsError, FileNotFoundError, RuntimeError, ValueError) as exc:
        print(
            json.dumps(
                {"action": "error", "error_type": type(exc).__name__, "message": str(exc)},
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
