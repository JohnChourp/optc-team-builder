export function applyIonicModalDialogLabel(event: Event, label: string): void {
  applyIonicModalDialogLabelToElement(event.target as HTMLElement, label);
}

/**
 * The same, for a modal that is already presented. Ionic copies the modal's label onto its inner
 * dialog only once, when it loads, so a modal whose title changes while it stays open has to be
 * renamed by hand or it keeps announcing the old title.
 */
export function applyIonicModalDialogLabelToElement(
  modalElement: HTMLElement & { shadowRoot?: ShadowRoot | null },
  label: string,
): void {
  const normalizedLabel = label.trim();

  if (!normalizedLabel.length) {
    return;
  }

  modalElement.setAttribute('aria-label', normalizedLabel);

  const applyLabel = (): void => {
    const dialogElement =
      modalElement.querySelector<HTMLElement>('[role="dialog"]') ??
      modalElement.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');

    dialogElement?.setAttribute('aria-label', normalizedLabel);
  };

  applyLabel();

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(applyLabel);
  }
}
