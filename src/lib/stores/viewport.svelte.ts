/**
 * Layout classes, mirroring the CSS breakpoints in app.css:
 *  - compact: iPhone (< 640 px wide, or < 560 px tall = phone landscape) — bottom tab bar
 *  - tablet:  iPad portrait (≥ 640 px; Split View too) — floating tab bar, wider cards and grids
 *  - wide:    iPad landscape (≥ 900 px, landscape) — sidebar, split views
 *
 * Layout itself is pure CSS; these flags only decide whether extra panes are *mounted*
 * (e.g. the inline add panel on Today), so phones don't pay for hidden UI.
 * On the server they are false, so SSR always renders the phone markup.
 */
import { MediaQuery } from 'svelte/reactivity';

export const TABLET_QUERY = '(min-width: 640px) and (min-height: 560px)';
export const WIDE_QUERY = '(min-width: 900px) and (min-height: 560px) and (orientation: landscape)';

const tablet = new MediaQuery(TABLET_QUERY, false);
const wide = new MediaQuery(WIDE_QUERY, false);

export const viewport = {
	get tablet() {
		return tablet.current;
	},
	get wide() {
		return wide.current;
	}
};
