// spinner.js — Reusable loading spinner.
//
// The SVG structure and stroke-dasharray animation technique are adapted
// from uiball's `ldrs` Ring loader (MIT license, github.com/GriffinJohnston/ldrs)
// — a track circle + an animated arc circle, rotating continuously while
// the arc's dash length stretches and contracts. Rebuilt here as a plain
// static SVG+CSS helper instead of pulling in the actual npm package: ldrs
// ships as self-registering Web Components with Shadow DOM, which is more
// machinery than a single spinner style needs, and this app's existing
// convention is plain DOM manipulation, not custom elements. Recolored to
// use this app's own --accent variable instead of a hardcoded color, so it
// automatically matches whichever accent/Mod is currently active.
//
// Usage: Spinner.html(size) to get an HTML string for an innerHTML template,
// or Spinner.attach(container, size) to mount it directly into an element.

const Spinner = {
  html(size = 22) {
    return `<span class="hq-spinner" style="--spinner-size:${size}px" aria-label="Loading">
      <svg class="hq-spinner-svg" viewBox="0 0 44 44">
        <circle class="hq-spinner-track" cx="22" cy="22" r="18" pathLength="100" />
        <circle class="hq-spinner-arc" cx="22" cy="22" r="18" pathLength="100" />
      </svg>
    </span>`;
  },

  attach(container, size = 22) {
    if (!container) return;
    container.innerHTML = this.html(size);
  },
};
