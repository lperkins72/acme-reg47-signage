(function () {
  "use strict";

  const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const PRESETS = [
    "#000000", "#ffffff", "#8c949d", "#7d8792", "#6f7a86", "#aeb6bf",
    "#0f1114", "#171b22", "#1f4f8a", "#2f6fb5", "#173e6d", "#0d1b2a",
    "#2f6a3b", "#32ff24", "#d8fb2d", "#f5d36b", "#ff7a2f", "#c92a2a",
    "#6b2f3f", "#46e6fb", "#3b82f6", "#14213d", "#1b2a2f", "#101419"
  ];

  let panel = null;
  let activeInput = null;
  let previousValue = "#000000";
  let currentValue = "#000000";

  function normalizeHex(value, fallback = "#000000") {
    const raw = String(value || "").trim();
    const match = raw.match(COLOR_RE);
    if (!match) return fallback;
    let hex = match[1].toLowerCase();
    if (hex.length === 3) {
      hex = hex.split("").map((char) => char + char).join("");
    }
    return `#${hex}`;
  }

  function hexToRgb(hex) {
    const safe = normalizeHex(hex).slice(1);
    const value = parseInt(safe, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255
    };
  }

  function rgbToHex(r, g, b) {
    const toHex = (value) => Math.max(0, Math.min(255, Number(value) || 0))
      .toString(16)
      .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function dispatchColorEvents(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncInputFace(input) {
    const value = normalizeHex(input.value);
    input.style.setProperty("--kiosk-color-value", value);
    input.setAttribute("aria-label", `Color ${value}`);
  }

  function patchValueProperty(input) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (!descriptor || input.dataset.kioskColorValuePatched === "true") return;

    Object.defineProperty(input, "value", {
      configurable: true,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        descriptor.set.call(this, value);
        syncInputFace(this);
      }
    });

    input.dataset.kioskColorValuePatched = "true";
  }

  function installStyles() {
    if (document.getElementById("kioskColorPickerStyles")) return;
    const style = document.createElement("style");
    style.id = "kioskColorPickerStyles";
    style.textContent = `
      .kiosk-color-input {
        --kiosk-color-value: #000000;
        min-height: 32px;
        padding-left: 44px !important;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        cursor: pointer !important;
        background:
          linear-gradient(90deg, var(--kiosk-color-value) 0 34px, #0f1318 34px) !important;
        color: #f2f4f7 !important;
        border: 1px solid #2b3340 !important;
        border-radius: 4px !important;
      }

      .kiosk-color-panel {
        position: fixed;
        left: 50%;
        top: 50%;
        z-index: 2147483647;
        width: min(92vw, 420px);
        transform: translate(-50%, -50%);
        display: none;
        padding: 16px;
        color: #f2f4f7;
        background: rgba(13, 17, 23, 0.98);
        border: 1px solid #334155;
        border-radius: 14px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.72);
        font-family: "Segoe UI", Arial, sans-serif;
      }

      .kiosk-color-panel.is-open {
        display: block;
      }

      .kiosk-color-header,
      .kiosk-color-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .kiosk-color-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
      }

      .kiosk-color-close,
      .kiosk-color-button {
        border: 1px solid #334155;
        border-radius: 8px;
        background: #172033;
        color: #f2f4f7;
        cursor: pointer;
        padding: 8px 10px;
      }

      .kiosk-color-close {
        width: 34px;
        height: 34px;
        padding: 0;
        font-size: 18px;
        line-height: 1;
      }

      .kiosk-color-preview {
        height: 54px;
        margin: 14px 0;
        border: 1px solid #334155;
        border-radius: 10px;
        background: var(--kiosk-picker-color, #000000);
      }

      .kiosk-color-hex {
        width: 100%;
        padding: 9px 10px;
        border: 1px solid #334155;
        border-radius: 8px;
        background: #090d14;
        color: #f2f4f7;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      }

      .kiosk-color-slider-row {
        display: grid;
        grid-template-columns: 22px 1fr 38px;
        align-items: center;
        gap: 10px;
        margin-top: 10px;
        font-size: 12px;
        color: #cbd5e1;
      }

      .kiosk-color-slider-row input[type="range"] {
        width: 100%;
      }

      .kiosk-color-presets {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 8px;
        margin: 14px 0;
      }

      .kiosk-color-swatch {
        width: 100%;
        aspect-ratio: 1;
        min-height: 28px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 7px;
        background: var(--swatch-color);
        cursor: pointer;
      }

      .kiosk-color-button.primary {
        background: #2563eb;
        border-color: #3b82f6;
      }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.className = "kiosk-color-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.innerHTML = `
      <div class="kiosk-color-header">
        <h3 class="kiosk-color-title">Choose Color</h3>
        <button class="kiosk-color-close" type="button" data-color-close aria-label="Close">x</button>
      </div>
      <div class="kiosk-color-preview" data-color-preview></div>
      <input class="kiosk-color-hex" data-color-hex type="text" inputmode="text" maxlength="7" spellcheck="false">
      <div class="kiosk-color-slider-row">
        <span>R</span><input data-color-range="r" type="range" min="0" max="255" value="0"><span data-color-value="r">0</span>
      </div>
      <div class="kiosk-color-slider-row">
        <span>G</span><input data-color-range="g" type="range" min="0" max="255" value="0"><span data-color-value="g">0</span>
      </div>
      <div class="kiosk-color-slider-row">
        <span>B</span><input data-color-range="b" type="range" min="0" max="255" value="0"><span data-color-value="b">0</span>
      </div>
      <div class="kiosk-color-presets" data-color-presets></div>
      <div class="kiosk-color-actions">
        <button class="kiosk-color-button" type="button" data-color-cancel>Cancel</button>
        <button class="kiosk-color-button primary" type="button" data-color-apply>Apply</button>
      </div>
    `;

    const presets = panel.querySelector("[data-color-presets]");
    PRESETS.forEach((color) => {
      const button = document.createElement("button");
      button.className = "kiosk-color-swatch";
      button.type = "button";
      button.style.setProperty("--swatch-color", color);
      button.setAttribute("aria-label", color);
      button.addEventListener("click", () => setPanelColor(color, true));
      presets.appendChild(button);
    });

    panel.querySelector("[data-color-close]").addEventListener("click", closePanel);
    panel.querySelector("[data-color-cancel]").addEventListener("click", cancelPanel);
    panel.querySelector("[data-color-apply]").addEventListener("click", applyPanel);
    panel.querySelector("[data-color-hex]").addEventListener("input", (event) => {
      const value = normalizeHex(event.target.value, "");
      if (value) setPanelColor(value, true);
    });
    panel.querySelectorAll("[data-color-range]").forEach((slider) => {
      slider.addEventListener("input", () => {
        const r = panel.querySelector('[data-color-range="r"]').value;
        const g = panel.querySelector('[data-color-range="g"]').value;
        const b = panel.querySelector('[data-color-range="b"]').value;
        setPanelColor(rgbToHex(r, g, b), true);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (!panel.classList.contains("is-open")) return;
      if (event.key === "Escape") cancelPanel();
      if (event.key === "Enter" && event.target.matches(".kiosk-color-hex")) applyPanel();
    });

    document.body.appendChild(panel);
    return panel;
  }

  function setPanelColor(color, dispatch) {
    if (!activeInput) return;
    currentValue = normalizeHex(color, currentValue);
    const rgb = hexToRgb(currentValue);
    panel.style.setProperty("--kiosk-picker-color", currentValue);
    panel.querySelector("[data-color-hex]").value = currentValue;
    ["r", "g", "b"].forEach((channel) => {
      panel.querySelector(`[data-color-range="${channel}"]`).value = rgb[channel];
      panel.querySelector(`[data-color-value="${channel}"]`).textContent = rgb[channel];
    });
    activeInput.value = currentValue;
    syncInputFace(activeInput);
    if (dispatch) dispatchColorEvents(activeInput);
  }

  function openPanel(input) {
    createPanel();
    activeInput = input;
    previousValue = normalizeHex(input.value);
    setPanelColor(previousValue, false);
    panel.classList.add("is-open");
    panel.querySelector("[data-color-hex]").focus();
    panel.querySelector("[data-color-hex]").select();
  }

  function closePanel() {
    if (!panel) return;
    panel.classList.remove("is-open");
    activeInput = null;
  }

  function cancelPanel() {
    if (activeInput) {
      activeInput.value = previousValue;
      syncInputFace(activeInput);
      dispatchColorEvents(activeInput);
    }
    closePanel();
  }

  function applyPanel() {
    if (activeInput) {
      activeInput.value = currentValue;
      syncInputFace(activeInput);
      dispatchColorEvents(activeInput);
    }
    closePanel();
  }

  function upgradeColorInput(input) {
    if (input.dataset.kioskColorPicker === "true") return;
    const value = normalizeHex(input.value);
    input.type = "text";
    input.readOnly = true;
    input.value = value;
    input.classList.add("kiosk-color-input");
    input.dataset.kioskColorPicker = "true";
    patchValueProperty(input);
    syncInputFace(input);

    input.addEventListener("click", (event) => {
      event.preventDefault();
      openPanel(input);
    });
    input.addEventListener("focus", () => {
      syncInputFace(input);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPanel(input);
      }
    });
  }

  function upgradeAllColorInputs() {
    installStyles();
    document.querySelectorAll('input[type="color"]').forEach(upgradeColorInput);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", upgradeAllColorInputs, { once: true });
  } else {
    upgradeAllColorInputs();
  }
})();
