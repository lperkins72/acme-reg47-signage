(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const GLYPH_HEIGHT = 8;
  const BASE_SCALE = 0.75;
  const STYLE_ID = "tiny-pixel-clock-v2-styles";

  const SEGMENTS = {
    a: [0, 0, 6, 2],
    b: [4, 0, 2, 4],
    c: [4, 4, 2, 4],
    d: [0, 6, 6, 2],
    e: [0, 4, 2, 4],
    f: [0, 0, 2, 4],
    g: [0, 3, 6, 2]
  };

  const GLYPHS = {
    "0": glyphFromSegments(6, ["a", "b", "c", "d", "e", "f"]),
    "1": {
      width: 2,
      rects: [[0, 0, 2, 8]]
    },
    "2": glyphFromSegments(6, ["a", "b", "g", "e", "d"]),
    "3": glyphFromSegments(6, ["a", "b", "g", "c", "d"]),
    "4": glyphFromSegments(6, ["f", "g", "b", "c"]),
    "5": glyphFromSegments(6, ["a", "f", "g", "c", "d"]),
    "6": glyphFromSegments(6, ["a", "f", "g", "e", "c", "d"]),
    "7": glyphFromSegments(6, ["a", "b", "c"]),
    "8": glyphFromSegments(6, ["a", "b", "c", "d", "e", "f", "g"]),
    "9": glyphFromSegments(6, ["a", "b", "c", "d", "f", "g"]),
    ":": {
      width: 2,
      rects: [
        [0, 1, 2, 2],
        [0, 5, 2, 2]
      ]
    },
    "-": {
      width: 6,
      rects: [[0, 3, 6, 2]]
    },
    " ": {
      width: 2,
      rects: []
    }
  };

  class TinyPixelClockV2 {
    constructor(options) {
      this.options = {
        parent: document.body,
        x: 24,
        y: 24,
        color: "#f8fafc",
        glyphGap: 2,
        lineGap: 3,
        showSeconds: true,
        scale: BASE_SCALE,
        storageKey: ""
      };
      Object.assign(this.options, options || {});

      injectStyles();

      this.root = document.createElement("div");
      this.root.className = "tiny-pixel-clock tiny-pixel-clock--v2";
      this.root.style.left = "0px";
      this.root.style.top = "0px";

      this.timeLine = document.createElement("div");
      this.timeLine.className = "tiny-pixel-clock__line";
      this.dateLine = document.createElement("div");
      this.dateLine.className = "tiny-pixel-clock__line";

      this.root.append(this.timeLine, this.dateLine);
      this.options.parent.appendChild(this.root);

      this.pointerId = null;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.dragMoved = false;
      this.lastTime = "";
      this.lastDate = "";
      this.timer = null;
      this.clickTimes = [];

      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onClick = this.onClick.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onModalBackdropClick = this.onModalBackdropClick.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);

      this.root.addEventListener("pointerdown", this.onPointerDown);
      this.root.addEventListener("pointermove", this.onPointerMove);
      this.root.addEventListener("pointerup", this.onPointerUp);
      this.root.addEventListener("pointercancel", this.onPointerUp);
      this.root.addEventListener("click", this.onClick);
      window.addEventListener("resize", this.onResize);
      document.addEventListener("keydown", this.onKeyDown);

      this.modal = this.buildModal();

      const savedState = this.loadState();
      this.color = savedState?.color || this.options.color;
      const initialPosition = {
        x: savedState?.x ?? this.options.x,
        y: savedState?.y ?? this.options.y
      };

      this.applyAppearance();
      this.setPosition(initialPosition.x, initialPosition.y);
      this.update();
    }

    buildModal() {
      const backdrop = document.createElement("div");
      backdrop.className = "tiny-pixel-clock__modal-backdrop";
      backdrop.innerHTML = `
        <div class="tiny-pixel-clock__modal" role="dialog" aria-modal="true" aria-label="Clock color settings">
          <div class="tiny-pixel-clock__modal-header">
            <h2>Clock Color</h2>
            <button type="button" class="tiny-pixel-clock__close" aria-label="Close">x</button>
          </div>
          <label class="tiny-pixel-clock__field">
            <span>Color</span>
            <input class="tiny-pixel-clock__color-input" type="color">
          </label>
          <p class="tiny-pixel-clock__hint">Triple-click the clock within 3 seconds to open this panel.</p>
        </div>
      `;

      this.options.parent.appendChild(backdrop);

      this.modalColorInput = backdrop.querySelector(".tiny-pixel-clock__color-input");
      this.modalCloseButton = backdrop.querySelector(".tiny-pixel-clock__close");

      this.modalColorInput.value = normalizeColor(this.color || this.options.color);
      this.modalColorInput.addEventListener("input", () => {
        this.color = this.modalColorInput.value;
        this.applyAppearance();
        this.saveState();
      });
      this.modalCloseButton.addEventListener("click", () => this.closeModal());
      backdrop.addEventListener("click", this.onModalBackdropClick);

      return backdrop;
    }

    loadState() {
      if (!this.options.storageKey) return null;
      try {
        const rawValue = window.localStorage.getItem(this.options.storageKey);
        if (!rawValue) return null;
        const parsed = JSON.parse(rawValue);
        if (
          !Number.isFinite(parsed.x) ||
          !Number.isFinite(parsed.y) ||
          typeof parsed.color !== "string"
        ) {
          return null;
        }
        return parsed;
      } catch (error) {
        return null;
      }
    }

    saveState() {
      if (!this.options.storageKey) return;
      try {
        window.localStorage.setItem(
          this.options.storageKey,
          JSON.stringify({
            x: this.positionX,
            y: this.positionY,
            color: this.color
          })
        );
      } catch (error) {
        // Ignore storage failures.
      }
    }

    applyAppearance() {
      this.root.style.color = this.color;
      this.root.style.setProperty("--tiny-clock-glyph-gap", `${this.options.glyphGap * this.options.scale}px`);
      this.root.style.setProperty("--tiny-clock-line-gap", `${this.options.lineGap * this.options.scale}px`);
      this.root.style.setProperty("--tiny-clock-scale", String(this.options.scale));
      this.root.style.setProperty("--tiny-clock-padding", `${4 * this.options.scale}px`);
      this.modalColorInput.value = normalizeColor(this.color);
    }

    onPointerDown(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      const bounds = this.root.getBoundingClientRect();
      this.pointerId = event.pointerId;
      this.dragOffsetX = event.clientX - bounds.left;
      this.dragOffsetY = event.clientY - bounds.top;
      this.dragMoved = false;
      this.root.classList.add("is-dragging");
      this.root.setPointerCapture(event.pointerId);
    }

    onPointerMove(event) {
      if (event.pointerId !== this.pointerId) return;
      const nextX = event.clientX - this.dragOffsetX;
      const nextY = event.clientY - this.dragOffsetY;
      if (
        !this.dragMoved &&
        (Math.abs(nextX - this.positionX) > 2 || Math.abs(nextY - this.positionY) > 2)
      ) {
        this.dragMoved = true;
      }
      this.setPosition(nextX, nextY);
    }

    onPointerUp(event) {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.root.classList.remove("is-dragging");
      this.root.releasePointerCapture(event.pointerId);
      this.saveState();
    }

    onClick() {
      if (this.dragMoved) return;
      const now = Date.now();
      this.clickTimes = this.clickTimes.filter((timestamp) => now - timestamp <= 3000);
      this.clickTimes.push(now);

      if (this.clickTimes.length >= 3) {
        this.clickTimes = [];
        this.openModal();
      }
    }

    onResize() {
      this.setPosition(this.positionX, this.positionY);
    }

    onModalBackdropClick(event) {
      if (event.target === this.modal) {
        this.closeModal();
      }
    }

    onKeyDown(event) {
      if (event.key === "Escape") {
        this.closeModal();
      }
    }

    openModal() {
      this.modal.classList.add("is-open");
      this.modalColorInput.focus();
    }

    closeModal() {
      this.modal.classList.remove("is-open");
    }

    setPosition(x, y) {
      const bounds = this.measureBounds();
      const maxX = Math.max(0, window.innerWidth - bounds.width);
      const maxY = Math.max(0, window.innerHeight - bounds.height);

      this.positionX = Math.max(0, Math.min(maxX, Math.round(x)));
      this.positionY = Math.max(0, Math.min(maxY, Math.round(y)));

      this.root.style.left = `${this.positionX}px`;
      this.root.style.top = `${this.positionY}px`;
    }

    measureBounds() {
      const rect = this.root.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return rect;
      }
      const scale = this.options.scale;
      return {
        width: this.root.offsetWidth * scale,
        height: this.root.offsetHeight * scale
      };
    }

    update() {
      const now = new Date();
      const timeText = formatTime(now, this.options.showSeconds);
      const dateText = formatDate(now);

      if (timeText !== this.lastTime) {
        this.renderLine(this.timeLine, timeText);
        this.lastTime = timeText;
      }

      if (dateText !== this.lastDate) {
        this.renderLine(this.dateLine, dateText);
        this.lastDate = dateText;
      }

      this.setPosition(this.positionX, this.positionY);
      this.scheduleNextTick();
    }

    scheduleNextTick() {
      window.clearTimeout(this.timer);
      const now = Date.now();
      this.timer = window.setTimeout(() => this.update(), 1000 - (now % 1000) + 10);
    }

    renderLine(target, text) {
      const fragment = document.createDocumentFragment();

      for (const character of text) {
        fragment.appendChild(createGlyphElement(character, this.options.scale));
      }

      target.replaceChildren(fragment);
    }

    destroy() {
      window.clearTimeout(this.timer);
      window.removeEventListener("resize", this.onResize);
      document.removeEventListener("keydown", this.onKeyDown);
      this.root.removeEventListener("pointerdown", this.onPointerDown);
      this.root.removeEventListener("pointermove", this.onPointerMove);
      this.root.removeEventListener("pointerup", this.onPointerUp);
      this.root.removeEventListener("pointercancel", this.onPointerUp);
      this.root.removeEventListener("click", this.onClick);
      this.modal.removeEventListener("click", this.onModalBackdropClick);
      this.root.remove();
      this.modal.remove();
    }
  }

  function createGlyphElement(character, scale) {
    const glyph = GLYPHS[character] || GLYPHS[" "];
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "tiny-pixel-clock__glyph");
    svg.setAttribute("viewBox", `0 0 ${glyph.width} ${GLYPH_HEIGHT}`);
    svg.setAttribute("width", glyph.width * scale);
    svg.setAttribute("height", GLYPH_HEIGHT * scale);
    svg.setAttribute("aria-hidden", "true");

    for (const rect of glyph.rects) {
      const [x, y, width, height] = rect;
      const node = document.createElementNS(SVG_NS, "rect");
      node.setAttribute("x", x);
      node.setAttribute("y", y);
      node.setAttribute("width", width);
      node.setAttribute("height", height);
      node.setAttribute("fill", "currentColor");
      svg.appendChild(node);
    }

    return svg;
  }

  function glyphFromSegments(width, names) {
    return {
      width,
      rects: names.map((name) => SEGMENTS[name])
    };
  }

  function formatTime(date, showSeconds) {
    const parts = [pad2(date.getHours()), pad2(date.getMinutes())];
    if (showSeconds) {
      parts.push(pad2(date.getSeconds()));
    }
    return parts.join(":");
  }

  function formatDate(date) {
    return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad2(date.getFullYear() % 100)}`;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function normalizeColor(value) {
    const rawValue = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(rawValue) ? rawValue : "#f8fafc";
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .tiny-pixel-clock--v2 {
        position: fixed;
        z-index: 9999;
        display: inline-flex;
        flex-direction: column;
        gap: var(--tiny-clock-line-gap, 2.25px);
        padding: var(--tiny-clock-padding, 3px);
        border-radius: 4px;
        cursor: grab;
        user-select: none;
        touch-action: none;
        background: transparent;
      }

      .tiny-pixel-clock--v2:hover,
      .tiny-pixel-clock--v2.is-dragging {
        background: rgba(15, 23, 42, 0.22);
      }

      .tiny-pixel-clock--v2.is-dragging {
        cursor: grabbing;
      }

      .tiny-pixel-clock--v2 .tiny-pixel-clock__line {
        display: flex;
        align-items: flex-start;
        gap: var(--tiny-clock-glyph-gap, 1.5px);
        height: ${GLYPH_HEIGHT * BASE_SCALE}px;
      }

      .tiny-pixel-clock--v2 .tiny-pixel-clock__glyph {
        flex: 0 0 auto;
        overflow: visible;
        shape-rendering: crispEdges;
        pointer-events: none;
      }

      .tiny-pixel-clock__modal-backdrop {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(2, 6, 23, 0.72);
        z-index: 10000;
      }

      .tiny-pixel-clock__modal-backdrop.is-open {
        display: flex;
      }

      .tiny-pixel-clock__modal {
        width: min(280px, 100%);
        padding: 16px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 14px;
        background: #0f172a;
        color: #e2e8f0;
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
        font: 14px/1.4 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      }

      .tiny-pixel-clock__modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      .tiny-pixel-clock__modal-header h2 {
        margin: 0;
        font-size: 16px;
      }

      .tiny-pixel-clock__close {
        border: 0;
        background: transparent;
        color: #cbd5e1;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }

      .tiny-pixel-clock__field {
        display: grid;
        gap: 8px;
      }

      .tiny-pixel-clock__field span {
        color: #cbd5e1;
      }

      .tiny-pixel-clock__color-input {
        width: 100%;
        height: 44px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 10px;
        background: #020617;
        padding: 4px;
      }

      .tiny-pixel-clock__hint {
        margin: 12px 0 0;
        color: #94a3b8;
        font-size: 12px;
      }
    `;

    document.head.appendChild(style);
  }

  window.TinyPixelClockV2 = TinyPixelClockV2;
})();
