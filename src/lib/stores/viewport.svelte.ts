/**
 * Layout tiers, mirroring the CSS breakpoints in app.css:
 *  - compact: phones (< 640 px wide, or < 560 px tall = phone landscape) — floating tab bar
 *  - tablet:  iPad portrait (≥ 640 px; Split View too) — wider floating bar, cards and grids
 *  - wide:    iPad landscape, small laptops (≥ 900 px, landscape) — sidebar, split views
 *  - desktop: laptops (≥ 1400 px, above every iPad) — two-column detail pages, taller charts
 *  - ultra:   monitors and ultrawide (≥ 1800 px) — third pane, centred app shell
 *
 * Layout itself is pure CSS; these flags only decide whether extra panes are *mounted*
 * (e.g. the inline add panel on Today), so phones don't pay for hidden UI.
 * On the server they are false, so SSR always renders the phone markup.
 *
 * `mouse` is about input, not size: it adds affordances for what touch does with a swipe.
 */
import { MediaQuery } from 'svelte/reactivity';

export const TABLET_QUERY = '(min-width: 640px) and (min-height: 560px), (min-width: 1000px)';
export const WIDE_QUERY =
	'(min-width: 900px) and (min-height: 560px) and (orientation: landscape), (min-width: 1000px) and (orientation: landscape)';
export const DESKTOP_QUERY = '(min-width: 1400px) and (orientation: landscape)';
export const ULTRA_QUERY = '(min-width: 1800px) and (orientation: landscape)';
export const MOUSE_QUERY = '(hover: hover) and (pointer: fine)';

const tablet = new MediaQuery(TABLET_QUERY, false);
const wide = new MediaQuery(WIDE_QUERY, false);
const desktop = new MediaQuery(DESKTOP_QUERY, false);
const ultra = new MediaQuery(ULTRA_QUERY, false);
const mouse = new MediaQuery(MOUSE_QUERY, false);

export const viewport = {
	get tablet() {
		return tablet.current;
	},
	get wide() {
		return wide.current;
	},
	get desktop() {
		return desktop.current;
	},
	get ultra() {
		return ultra.current;
	},
	get mouse() {
		return mouse.current;
	},
	/** Has a touchscreen, even with a mouse or trackpad attached (iPad with a keyboard case). */
	get touch() {
		return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
	}
};
