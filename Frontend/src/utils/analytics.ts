type Props = Record<string, string | number | boolean>;

export function track(event: string, props?: Props): void {
	window.plausible?.(event, props ? { props } : undefined);
}
