export function applyIonicModalDialogLabel(event: Event, label: string): void {
  const normalizedLabel = label.trim();

  if (!normalizedLabel.length) {
    return;
  }

  const modalElement = event.target as HTMLElement & { shadowRoot?: ShadowRoot | null };

  modalElement.setAttribute('aria-label', normalizedLabel);

  const applyLabel = (): void => {
    const dialogElement =
      modalElement.querySelector<HTMLElement>('[role="dialog"]') ??
      modalElement.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');

    dialogElement?.setAttribute('aria-label', normalizedLabel);
  };

  applyLabel();
  requestAnimationFrame(applyLabel);
}
