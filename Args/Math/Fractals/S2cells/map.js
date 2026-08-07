(() => {
  "use strict";

  const DEFAULT_VIEW = { lat: 41.9028, lng: 12.4964, zoom: 17 };
  const DISPLAY_LEVELS = {
    14: { minZoom: 12, limit: 650, color: "#ffd166", pane: "s2L14Pane", weight: 2.8 },
    17: { minZoom: 16, limit: 1300, color: "#45f08b", pane: "s2L17Pane", weight: 1.45 }
  };
  const viewParams = new URLSearchParams(window.location.search);
  const storedView = readStoredView();
  const start = {
    lat: boundedNumber(viewParams.get("lat"), -85, 85, storedView.lat ?? DEFAULT_VIEW.lat),
    lng: boundedNumber(viewParams.get("lng"), -180, 180, storedView.lng ?? DEFAULT_VIEW.lng),
    zoom: boundedNumber(viewParams.get("z"), 3, 20, storedView.zoom ?? DEFAULT_VIEW.zoom)
  };

  const map = L.map("map", {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    minZoom: 3,
    maxZoom: 20,
    worldCopyJump: true
  }).setView([start.lat, start.lng], start.zoom);

  map.createPane("s2L14Pane");
  map.createPane("s2L17Pane");
  map.createPane("s2SelectionPane");
  map.createPane("poiPane");
  map.getPane("s2L14Pane").style.zIndex = "440";
  map.getPane("s2L17Pane").style.zIndex = "450";
  map.getPane("s2SelectionPane").style.zIndex = "460";
  map.getPane("poiPane").style.zIndex = "470";

  const renderers = {
    14: L.canvas({ pane: "s2L14Pane", padding: 0.35 }),
    17: L.canvas({ pane: "s2L17Pane", padding: 0.35 }),
    selection: L.canvas({ pane: "s2SelectionPane", padding: 0.35 })
  };
  const basemaps = {
    street: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }),
    satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: "Tiles &copy; Esri, Vantor, Earthstar Geographics, and the GIS User Community"
    })
  };
  const gridLayers = { 14: L.layerGroup(), 17: L.layerGroup() };
  const selectionLayer = L.layerGroup().addTo(map);
  const locationLayer = L.layerGroup().addTo(map);
  const poiLayer = L.layerGroup().addTo(map);
  const controls = collectControls();
  const state = {
    basemap: readStoredBasemap(),
    show: { 14: true, 17: true },
    opacity: Number(controls.gridOpacity.value) / 100,
    renderFrame: 0,
    selected: null,
    cellStatus: "",
    poi: {
      records: [],
      loaded: false,
      error: null,
      visibleCount: 0,
      show: true,
      types: {
        "Wayspot Submission": true,
        "Photo Submission": true
      }
    }
  };

  basemaps[state.basemap].addTo(map);
  gridLayers[14].addTo(map);
  gridLayers[17].addTo(map);
  L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 120 }).addTo(map);
  markBasemapChoice();
  bindControls();
  bindMapEvents();
  selectPoint(map.getCenter(), false);
  scheduleRender();
  loadPoiDataset();

  function collectControls() {
    return {
      basemapButton: document.getElementById("basemapButton"),
      cellsButton: document.getElementById("cellsButton"),
      poiButton: document.getElementById("poiButton"),
      locateButton: document.getElementById("locateButton"),
      homeButton: document.getElementById("homeButton"),
      zoomInButton: document.getElementById("zoomInButton"),
      zoomOutButton: document.getElementById("zoomOutButton"),
      basemapPanel: document.getElementById("basemapPanel"),
      cellsPanel: document.getElementById("cellsPanel"),
      poiPanel: document.getElementById("poiPanel"),
      showL14: document.getElementById("showL14"),
      showL17: document.getElementById("showL17"),
      gridOpacity: document.getElementById("gridOpacity"),
      opacityValue: document.getElementById("opacityValue"),
      showPoi: document.getElementById("showPoi"),
      showWayspots: document.getElementById("showWayspots"),
      showPhotoSubmissions: document.getElementById("showPhotoSubmissions"),
      fitPoiButton: document.getElementById("fitPoiButton"),
      poiLoadedCount: document.getElementById("poiLoadedCount"),
      poiVisibleCount: document.getElementById("poiVisibleCount"),
      poiDatasetState: document.getElementById("poiDatasetState"),
      selectionSheet: document.getElementById("selectionSheet"),
      closeSelection: document.getElementById("closeSelection"),
      selectedCoordinate: document.getElementById("selectedCoordinate"),
      selectedL17: document.getElementById("selectedL17"),
      selectedL14: document.getElementById("selectedL14"),
      tokenL17: document.getElementById("tokenL17"),
      tokenL14: document.getElementById("tokenL14"),
      copyView: document.getElementById("copyView"),
      mapStatus: document.getElementById("mapStatus"),
      l14Count: document.getElementById("l14Count"),
      l17Count: document.getElementById("l17Count"),
      poiCount: document.getElementById("poiCount"),
      infoButton: document.getElementById("infoButton"),
      infoSheet: document.getElementById("infoSheet"),
      closeInfo: document.getElementById("closeInfo"),
      loadingIndicator: document.getElementById("loadingIndicator"),
      intro: document.querySelector(".map-intro"),
      basemapChoices: Array.from(document.querySelectorAll("[data-basemap]"))
    };
  }

  function bindControls() {
    controls.basemapButton.addEventListener("click", () => togglePanel("basemap"));
    controls.cellsButton.addEventListener("click", () => togglePanel("cells"));
    controls.poiButton.addEventListener("click", () => togglePanel("poi"));
    controls.basemapChoices.forEach((button) => {
      button.addEventListener("click", () => setBasemap(button.dataset.basemap));
    });
    controls.showL14.addEventListener("change", () => setLayerVisibility(14, controls.showL14.checked));
    controls.showL17.addEventListener("change", () => setLayerVisibility(17, controls.showL17.checked));
    controls.gridOpacity.addEventListener("input", () => {
      state.opacity = Number(controls.gridOpacity.value) / 100;
      controls.opacityValue.value = `${controls.gridOpacity.value}%`;
      scheduleRender();
    });
    controls.showPoi.addEventListener("change", () => {
      state.poi.show = controls.showPoi.checked;
      renderPoiLayer();
    });
    controls.showWayspots.addEventListener("change", () => {
      state.poi.types["Wayspot Submission"] = controls.showWayspots.checked;
      renderPoiLayer();
    });
    controls.showPhotoSubmissions.addEventListener("change", () => {
      state.poi.types["Photo Submission"] = controls.showPhotoSubmissions.checked;
      renderPoiLayer();
    });
    controls.fitPoiButton.addEventListener("click", fitVisiblePoi);
    controls.locateButton.addEventListener("click", () => {
      controls.mapStatus.textContent = "Requesting your location";
      map.locate({ setView: true, maxZoom: 18, enableHighAccuracy: true });
    });
    controls.homeButton.addEventListener("click", () => map.setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.zoom));
    controls.zoomInButton.addEventListener("click", () => map.zoomIn());
    controls.zoomOutButton.addEventListener("click", () => map.zoomOut());
    controls.closeSelection.addEventListener("click", () => {
      controls.selectionSheet.hidden = true;
      selectionLayer.clearLayers();
    });
    controls.copyView.addEventListener("click", copyViewLink);
    controls.infoButton.addEventListener("click", () => {
      closePanels();
      controls.infoSheet.hidden = false;
    });
    controls.closeInfo.addEventListener("click", () => {
      controls.infoSheet.hidden = true;
    });
    window.setTimeout(dismissIntro, 4200);
  }

  function bindMapEvents() {
    map.on("click", (event) => {
      dismissIntro();
      closePanels();
      selectPoint(event.latlng, true);
    });
    map.on("dragstart zoomstart", dismissIntro);
    map.on("moveend zoomend resize", () => {
      persistView();
      scheduleRender();
    });
    map.on("locationfound", (event) => {
      locationLayer.clearLayers();
      L.circle(event.latlng, {
        radius: Math.min(event.accuracy, 250),
        color: "#88bfff",
        fillColor: "#2979ff",
        fillOpacity: 0.14,
        weight: 1
      }).addTo(locationLayer);
      L.marker(event.latlng, {
        icon: L.divIcon({ className: "", html: '<span class="location-marker"></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
      }).addTo(locationLayer);
      selectPoint(event.latlng, true);
      controls.mapStatus.textContent = `Position found within ${Math.round(event.accuracy)} m`;
    });
    map.on("locationerror", () => {
      controls.mapStatus.textContent = "Location unavailable - choose a point on the map";
    });
    Object.values(basemaps).forEach((layer) => {
      layer.on("tileerror", () => {
        controls.mapStatus.textContent = "A map tile could not load - cell geometry is still available";
      });
    });
  }

  function togglePanel(name) {
    const showBasemap = name === "basemap" && controls.basemapPanel.hidden;
    const showCells = name === "cells" && controls.cellsPanel.hidden;
    const showPoi = name === "poi" && controls.poiPanel.hidden;
    controls.basemapPanel.hidden = !showBasemap;
    controls.cellsPanel.hidden = !showCells;
    controls.poiPanel.hidden = !showPoi;
    controls.basemapButton.setAttribute("aria-expanded", String(showBasemap));
    controls.cellsButton.setAttribute("aria-expanded", String(showCells));
    controls.poiButton.setAttribute("aria-expanded", String(showPoi));
    controls.infoSheet.hidden = true;
  }

  function closePanels() {
    controls.basemapPanel.hidden = true;
    controls.cellsPanel.hidden = true;
    controls.poiPanel.hidden = true;
    controls.basemapButton.setAttribute("aria-expanded", "false");
    controls.cellsButton.setAttribute("aria-expanded", "false");
    controls.poiButton.setAttribute("aria-expanded", "false");
  }

  function setBasemap(name) {
    if (!basemaps[name] || name === state.basemap) {
      closePanels();
      return;
    }
    map.removeLayer(basemaps[state.basemap]);
    state.basemap = name;
    basemaps[name].addTo(map);
    try {
      localStorage.setItem("s2-map-basemap", name);
    } catch {
      // The selected map still works when storage is disabled.
    }
    markBasemapChoice();
    closePanels();
  }

  function markBasemapChoice() {
    controls.basemapChoices.forEach((button) => {
      const selected = button.dataset.basemap === state.basemap;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setLayerVisibility(level, visible) {
    state.show[level] = visible;
    if (visible) {
      gridLayers[level].addTo(map);
    } else {
      gridLayers[level].clearLayers();
      map.removeLayer(gridLayers[level]);
      controls[`l${level}Count`].textContent = "0";
    }
    scheduleRender();
  }

  function scheduleRender() {
    window.cancelAnimationFrame(state.renderFrame);
    controls.loadingIndicator.classList.add("is-visible");
    state.renderFrame = window.requestAnimationFrame(() => {
      window.setTimeout(renderVisibleCells, 0);
    });
  }

  function renderVisibleCells() {
    const zoom = map.getZoom();
    const counts = { 14: 0, 17: 0 };

    [14, 17].forEach((level) => {
      const config = DISPLAY_LEVELS[level];
      gridLayers[level].clearLayers();
      if (!state.show[level] || zoom < config.minZoom) return;

      const cells = collectVisibleCells(level, config.limit);
      cells.forEach((cell) => {
        const boundary = unwrapPoints(cell.boundary(level === 14 ? 8 : 4), map.getCenter().lng);
        L.polyline([...boundary, boundary[0]], {
          pane: config.pane,
          renderer: renderers[level],
          color: config.color,
          opacity: state.opacity,
          weight: config.weight,
          lineCap: "round",
          lineJoin: "round",
          interactive: false
        }).addTo(gridLayers[level]);
      });
      counts[level] = cells.length;
    });

    controls.l14Count.textContent = String(counts[14]);
    controls.l17Count.textContent = String(counts[17]);
    state.cellStatus = statusMessage(zoom, counts);
    updateMapStatus();
    controls.loadingIndicator.classList.remove("is-visible");
  }

  function collectVisibleCells(level, limit) {
    const paddedBounds = map.getBounds().pad(0.15);
    const seed = S2Grid.Cell.fromLatLng(map.getCenter(), level);
    const queue = [seed];
    let cursor = 0;
    const seen = new Set();
    const cells = [];

    while (cursor < queue.length && cells.length < limit) {
      const cell = queue[cursor];
      cursor += 1;
      const key = cell.key();
      if (seen.has(key)) continue;
      seen.add(key);
      const corners = unwrapPoints(cell.corners(), map.getCenter().lng);
      if (!paddedBounds.intersects(L.latLngBounds(corners))) continue;
      cells.push(cell);
      cell.neighbors().forEach((neighbor) => {
        if (!seen.has(neighbor.key())) queue.push(neighbor);
      });
    }
    return cells;
  }

  function statusMessage(zoom, counts) {
    if (!state.show[14] && !state.show[17]) return "Both cell layers are hidden";
    if (zoom < DISPLAY_LEVELS[14].minZoom) return "Zoom to level 12 to draw L14 cells";
    if (zoom < DISPLAY_LEVELS[17].minZoom) return `${counts[14]} L14 cells - zoom to level 16 for L17`;
    return `${counts[14]} L14 and ${counts[17]} L17 cells in view`;
  }

  async function loadPoiDataset() {
    controls.fitPoiButton.disabled = true;
    try {
      const response = await fetch("data/wayfarer-poi.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.records)) throw new Error("Invalid dataset structure");

      state.poi.records = payload.records.filter((record) => (
        (record.submissionType === "Wayspot Submission" || record.submissionType === "Photo Submission")
        && Number.isFinite(Number(record.latitude))
        && Number.isFinite(Number(record.longitude))
      ));
      state.poi.loaded = true;
      state.poi.error = null;
      controls.poiLoadedCount.value = String(state.poi.records.length);
      controls.poiDatasetState.textContent = payload.publicReady && payload.reviewStatus === "complete"
        ? `${state.poi.records.length} reviewed POIs - ${payload.imageCounts?.excluded || 0} images excluded`
        : payload.partial
          ? `${state.poi.records.length} local sample POIs - privacy review pending`
          : `${state.poi.records.length} local POIs - privacy review pending`;
      controls.fitPoiButton.disabled = state.poi.records.length === 0;
      renderPoiLayer();
    } catch {
      state.poi.records = [];
      state.poi.loaded = false;
      state.poi.error = "POI dataset unavailable";
      controls.poiLoadedCount.value = "0";
      controls.poiVisibleCount.value = "0";
      controls.poiCount.textContent = "0";
      controls.poiDatasetState.textContent = "Local POI dataset not installed";
      controls.fitPoiButton.disabled = true;
      updateMapStatus();
    }
  }

  function visiblePoiRecords() {
    if (!state.poi.show) return [];
    return state.poi.records.filter((record) => state.poi.types[record.submissionType]);
  }

  function renderPoiLayer() {
    poiLayer.clearLayers();
    const records = visiblePoiRecords();

    records.forEach((record) => {
      const marker = L.marker([Number(record.latitude), Number(record.longitude)], {
        pane: "poiPane",
        title: record.title,
        keyboard: true,
        icon: poiMarkerIcon(record.submissionType)
      });
      marker.bindPopup(buildPoiPopup(record), {
        className: "poi-leaflet-popup",
        maxWidth: 310,
        minWidth: 220
      });
      marker.on("click", () => {
        selectPoint(L.latLng(Number(record.latitude), Number(record.longitude)), false);
      });
      marker.addTo(poiLayer);
    });

    state.poi.visibleCount = records.length;
    controls.poiVisibleCount.value = String(records.length);
    controls.poiCount.textContent = String(records.length);
    controls.fitPoiButton.disabled = records.length === 0;
    updateMapStatus();
  }

  function poiMarkerIcon(submissionType) {
    const kind = submissionType === "Photo Submission" ? "photo" : "wayspot";
    return L.divIcon({
      className: "poi-marker-icon",
      html: `<span class="poi-marker poi-marker--${kind}" aria-hidden="true"></span>`,
      iconSize: [19, 19],
      iconAnchor: [10, 10],
      popupAnchor: [0, -11]
    });
  }

  function buildPoiPopup(record) {
    const popup = document.createElement("article");
    popup.className = "poi-popup";

    const type = document.createElement("p");
    type.className = "poi-popup__type";
    type.textContent = record.submissionType;
    popup.append(type);

    const title = document.createElement("h3");
    title.textContent = record.title || "Untitled contribution";
    popup.append(title);

    const meta = document.createElement("p");
    meta.className = "poi-popup__meta";
    meta.textContent = [record.submissionDate, record.locality].filter(Boolean).join(" - ");
    popup.append(meta);

    const images = record.submissionType === "Photo Submission"
      ? [{ url: record.submittedPhotoUrl, label: "Your image submission" }]
      : [
          { url: record.mainSubmissionPhotoUrl, label: "Primary nomination photo" },
          { url: record.supportingPhotoUrl, label: "Supporting photo" }
        ];
    const availableImages = images.filter((image) => image.url);

    if (availableImages.length) {
      const imageRow = document.createElement("div");
      imageRow.className = `poi-popup__images${availableImages.length === 1 ? " is-single" : ""}`;
      availableImages.forEach((image) => {
        const element = document.createElement("img");
        element.src = image.url;
        element.alt = image.label;
        element.loading = "lazy";
        element.decoding = "async";
        imageRow.append(element);
      });
      popup.append(imageRow);
    }

    if (record.address) {
      const address = document.createElement("p");
      address.className = "poi-popup__address";
      address.textContent = record.address;
      popup.append(address);
    }

    if (record.description || record.supportingInformation) {
      const details = document.createElement("details");
      details.className = "poi-popup__details";
      const summary = document.createElement("summary");
      summary.textContent = "Submission details";
      details.append(summary);
      [record.description, record.supportingInformation].filter(Boolean).forEach((value) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = value;
        details.append(paragraph);
      });
      popup.append(details);
    }

    const review = document.createElement("p");
    review.className = "poi-popup__review";
    const reviewRoles = record.submissionType === "Photo Submission" ? ["submitted"] : ["primary", "support"];
    const reviewComplete = reviewRoles.every((role) => ["keep", "exclude"].includes(record.imageReview?.[role]));
    review.textContent = reviewComplete
      ? "Privacy review complete"
      : "Privacy review pending - local preview only";
    popup.append(review);

    const l17 = S2Grid.Cell.fromLatLng({ lat: Number(record.latitude), lng: Number(record.longitude) }, 17);
    const l14 = l17.parent(14);
    const cells = document.createElement("p");
    cells.className = "poi-popup__cells";
    cells.textContent = `L17 ${l17.token()} | L14 ${l14.token()}`;
    popup.append(cells);

    return popup;
  }

  function fitVisiblePoi() {
    const records = visiblePoiRecords();
    if (!records.length) return;
    if (records.length === 1) {
      map.setView([Number(records[0].latitude), Number(records[0].longitude)], 18);
    } else {
      map.fitBounds(L.latLngBounds(records.map((record) => [Number(record.latitude), Number(record.longitude)])), {
        padding: [42, 42],
        maxZoom: 18
      });
    }
    closePanels();
  }

  function updateMapStatus() {
    const base = state.cellStatus || "Move or zoom to inspect the grid";
    if (state.poi.error) {
      controls.mapStatus.textContent = `${base} - POI dataset unavailable`;
      return;
    }
    if (state.poi.loaded) {
      controls.mapStatus.textContent = `${base} - ${state.poi.visibleCount} POIs active`;
      return;
    }
    controls.mapStatus.textContent = base;
  }

  function selectPoint(latlng, reveal) {
    const normalized = L.latLng(latlng.lat, normalizeLng(latlng.lng));
    const l17 = S2Grid.Cell.fromLatLng(normalized, 17);
    const l14 = l17.parent(14);
    state.selected = normalized;
    selectionLayer.clearLayers();
    drawSelectedCell(l14, DISPLAY_LEVELS[14].color, 3.8, 0.04);
    drawSelectedCell(l17, DISPLAY_LEVELS[17].color, 3, 0.08);
    controls.selectedCoordinate.textContent = `${normalized.lat.toFixed(6)}, ${normalized.lng.toFixed(6)}`;
    controls.selectedL17.textContent = l17.address();
    controls.selectedL14.textContent = l14.address();
    controls.tokenL17.textContent = l17.token();
    controls.tokenL14.textContent = l14.token();
    if (reveal) controls.selectionSheet.hidden = false;
  }

  function drawSelectedCell(cell, color, weight, fillOpacity) {
    L.polygon(unwrapPoints(cell.boundary(10), map.getCenter().lng), {
      pane: "s2SelectionPane",
      renderer: renderers.selection,
      color,
      opacity: 1,
      weight,
      fillColor: color,
      fillOpacity,
      interactive: false
    }).addTo(selectionLayer);
  }

  async function copyViewLink() {
    const center = state.selected || map.getCenter();
    const url = new URL(window.location.href);
    url.searchParams.set("lat", center.lat.toFixed(6));
    url.searchParams.set("lng", normalizeLng(center.lng).toFixed(6));
    url.searchParams.set("z", String(map.getZoom()));
    try {
      await navigator.clipboard.writeText(url.toString());
      controls.copyView.textContent = "Link copied";
    } catch {
      window.prompt("Copy this map link", url.toString());
    }
    window.setTimeout(() => {
      controls.copyView.textContent = "Copy map link";
    }, 1600);
  }

  function persistView() {
    const center = map.getCenter();
    try {
      localStorage.setItem("s2-map-view", JSON.stringify({
        lat: Number(center.lat.toFixed(6)),
        lng: Number(normalizeLng(center.lng).toFixed(6)),
        zoom: map.getZoom()
      }));
    } catch {
      // The map remains fully usable when storage is disabled.
    }
  }

  function readStoredView() {
    try {
      const value = JSON.parse(localStorage.getItem("s2-map-view") || "null");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function readStoredBasemap() {
    try {
      return localStorage.getItem("s2-map-basemap") === "satellite" ? "satellite" : "street";
    } catch {
      return "street";
    }
  }

  function dismissIntro() {
    controls.intro.classList.add("is-dismissed");
  }

  function boundedNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalizeLng(lng) {
    return ((lng + 180) % 360 + 360) % 360 - 180;
  }

  function unwrapPoints(points, referenceLng) {
    return points.map((point) => {
      let lng = point.lng;
      while (lng - referenceLng > 180) lng -= 360;
      while (lng - referenceLng < -180) lng += 360;
      return { lat: point.lat, lng };
    });
  }
})();
