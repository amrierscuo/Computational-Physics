(() => {
  "use strict";

  const MAX_LEVEL = 30;
  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;

  function latLngToXYZ(latLng) {
    const phi = latLng.lat * DEG_TO_RAD;
    const theta = latLng.lng * DEG_TO_RAD;
    const cosPhi = Math.cos(phi);
    return [Math.cos(theta) * cosPhi, Math.sin(theta) * cosPhi, Math.sin(phi)];
  }

  function xyzToLatLng(xyz) {
    return {
      lat: Math.atan2(xyz[2], Math.hypot(xyz[0], xyz[1])) * RAD_TO_DEG,
      lng: Math.atan2(xyz[1], xyz[0]) * RAD_TO_DEG
    };
  }

  function largestAbsComponent(xyz) {
    const values = xyz.map(Math.abs);
    if (values[0] > values[1]) return values[0] > values[2] ? 0 : 2;
    return values[1] > values[2] ? 1 : 2;
  }

  function faceXYZToUV(face, xyz) {
    switch (face) {
      case 0: return [xyz[1] / xyz[0], xyz[2] / xyz[0]];
      case 1: return [-xyz[0] / xyz[1], xyz[2] / xyz[1]];
      case 2: return [-xyz[0] / xyz[2], -xyz[1] / xyz[2]];
      case 3: return [xyz[2] / xyz[0], xyz[1] / xyz[0]];
      case 4: return [xyz[2] / xyz[1], -xyz[0] / xyz[1]];
      case 5: return [-xyz[1] / xyz[2], -xyz[0] / xyz[2]];
      default: throw new Error("Invalid S2 face");
    }
  }

  function xyzToFaceUV(xyz) {
    let face = largestAbsComponent(xyz);
    if (xyz[face] < 0) face += 3;
    return [face, faceXYZToUV(face, xyz)];
  }

  function faceUVToXYZ(face, uv) {
    const [u, v] = uv;
    switch (face) {
      case 0: return [1, u, v];
      case 1: return [-u, 1, v];
      case 2: return [-u, -v, 1];
      case 3: return [-1, -v, -u];
      case 4: return [v, -1, -u];
      case 5: return [v, u, -1];
      default: throw new Error("Invalid S2 face");
    }
  }

  function singleSTToUV(value) {
    return value >= 0.5
      ? (4 * value * value - 1) / 3
      : (1 - 4 * (1 - value) * (1 - value)) / 3;
  }

  function stToUV(st) {
    return [singleSTToUV(st[0]), singleSTToUV(st[1])];
  }

  function singleUVToST(value) {
    return value >= 0
      ? 0.5 * Math.sqrt(1 + 3 * value)
      : 1 - 0.5 * Math.sqrt(1 - 3 * value);
  }

  function uvToST(uv) {
    return [singleUVToST(uv[0]), singleUVToST(uv[1])];
  }

  function stToIJ(st, level) {
    const size = 2 ** level;
    return st.map(value => Math.max(0, Math.min(size - 1, Math.floor(value * size))));
  }

  function ijToST(ij, level, offsets) {
    const size = 2 ** level;
    return [(ij[0] + offsets[0]) / size, (ij[1] + offsets[1]) / size];
  }

  function pointToHilbertQuads(x, y, level, face) {
    const hilbertMap = {
      a: [[0, "d"], [1, "a"], [3, "b"], [2, "a"]],
      b: [[2, "b"], [1, "b"], [3, "a"], [0, "c"]],
      c: [[2, "c"], [3, "d"], [1, "c"], [0, "b"]],
      d: [[0, "a"], [3, "c"], [1, "d"], [2, "d"]]
    };
    let square = face & 1 ? "d" : "a";
    const positions = [];
    for (let bit = level - 1; bit >= 0; bit -= 1) {
      const mask = 2 ** bit;
      const quadX = x & mask ? 1 : 0;
      const quadY = y & mask ? 1 : 0;
      const next = hilbertMap[square][quadX * 2 + quadY];
      positions.push(next[0]);
      square = next[1];
    }
    return positions;
  }

  class Cell {
    constructor(face, ij, level) {
      this.face = face;
      this.ij = ij;
      this.level = level;
    }

    static fromLatLng(latLng, level) {
      const xyz = latLngToXYZ(latLng);
      const [face, uv] = xyzToFaceUV(xyz);
      return new Cell(face, stToIJ(uvToST(uv), level), level);
    }

    static fromFaceIJ(face, ij, level) {
      return new Cell(face, ij, level);
    }

    key() {
      return `F${this.face}/${this.ij[0]}/${this.ij[1]}@${this.level}`;
    }

    address() {
      return `F${this.face} - L${this.level} - ${this.ij[0]}:${this.ij[1]}`;
    }

    center() {
      const st = ijToST(this.ij, this.level, [0.5, 0.5]);
      return xyzToLatLng(faceUVToXYZ(this.face, stToUV(st)));
    }

    corners() {
      return [[0, 0], [0, 1], [1, 1], [1, 0]].map(offset => {
        const st = ijToST(this.ij, this.level, offset);
        return xyzToLatLng(faceUVToXYZ(this.face, stToUV(st)));
      });
    }

    boundary(segmentsPerEdge = 6) {
      const corners = [[0, 0], [0, 1], [1, 1], [1, 0]];
      const points = [];
      for (let edge = 0; edge < corners.length; edge += 1) {
        const from = corners[edge];
        const to = corners[(edge + 1) % corners.length];
        for (let step = 0; step < segmentsPerEdge; step += 1) {
          const ratio = step / segmentsPerEdge;
          const offset = [
            from[0] + (to[0] - from[0]) * ratio,
            from[1] + (to[1] - from[1]) * ratio
          ];
          const st = ijToST(this.ij, this.level, offset);
          points.push(xyzToLatLng(faceUVToXYZ(this.face, stToUV(st))));
        }
      }
      return points;
    }

    parent(level) {
      if (level > this.level || level < 0) throw new Error("Invalid parent level");
      const shift = 2 ** (this.level - level);
      return new Cell(this.face, [Math.floor(this.ij[0] / shift), Math.floor(this.ij[1] / shift)], level);
    }

    neighbors() {
      const wrap = (face, ij, level) => {
        const size = 2 ** level;
        if (ij[0] >= 0 && ij[1] >= 0 && ij[0] < size && ij[1] < size) {
          return Cell.fromFaceIJ(face, ij, level);
        }
        const st = ijToST(ij, level, [0.5, 0.5]);
        const xyz = faceUVToXYZ(face, stToUV(st));
        const [wrappedFace, uv] = xyzToFaceUV(xyz);
        return Cell.fromFaceIJ(wrappedFace, stToIJ(uvToST(uv), level), level);
      };
      const [i, j] = this.ij;
      return [
        wrap(this.face, [i - 1, j], this.level),
        wrap(this.face, [i, j - 1], this.level),
        wrap(this.face, [i + 1, j], this.level),
        wrap(this.face, [i, j + 1], this.level)
      ];
    }

    token() {
      const quads = pointToHilbertQuads(this.ij[0], this.ij[1], this.level, this.face);
      let position = 0n;
      for (const quad of quads) position = (position << 2n) | BigInt(quad);
      const trailing = 2 * (MAX_LEVEL - this.level);
      const id = (BigInt(this.face) << 61n)
        | (position << BigInt(trailing + 1))
        | (1n << BigInt(trailing));
      return id.toString(16).padStart(16, "0").replace(/0+$/, "") || "0";
    }
  }

  window.S2Grid = { Cell, MAX_LEVEL };
})();
