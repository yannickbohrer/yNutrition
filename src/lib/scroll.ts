/**
 * Scroll indicators for panes that scroll on their own (the wide Today layout).
 *
 * Like on Apple platforms, the scrollbar of a `.pane-scroll` element stays invisible at rest and
 * shows while the pane is being scrolled (wheel, trackpad, keyboard, dragging) and while the pointer
 * is over it. CSS handles hover; this attachment flags active scrolling.
 */
const IDLE_MS = 900;

export function scrollIndicator(el: HTMLElement) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const onScroll = () => {
		el.classList.add('is-scrolling');
		clearTimeout(timer);
		timer = setTimeout(() => el.classList.remove('is-scrolling'), IDLE_MS);
	};
	el.addEventListener('scroll', onScroll, { passive: true });
	return () => {
		clearTimeout(timer);
		el.removeEventListener('scroll', onScroll);
	};
}
