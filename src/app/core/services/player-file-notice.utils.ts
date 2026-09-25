import { buildFailureMessage, type TranslateFn } from './failure-message.utils';
import { type PlayerFileNotice } from './player-file-delivery.utils';

/**
 * The words the app shell shows for a notice from `givePlayerFile`, in the reader's language.
 *
 * 869f63gqg. A failure is said in the failure vocabulary's `unexpected` family - what happened,
 * that nothing on this device changed, and to try again - because an export changes nothing on
 * the device, which is exactly the promise that family makes.
 *
 * Its own module rather than a function in the helper: eleven export utils import the helper,
 * and the vocabulary would bring the network-status service into every one of their import
 * graphs. The helper stays a signal and the platform; only the app shell needs the words.
 */
export function describePlayerFileNotice(
  notice: PlayerFileNotice | null,
  translate: TranslateFn,
): string {
  if (notice === 'failed') {
    return buildFailureMessage('unexpected', translate).lines.join(' ');
  }

  return notice === 'choose-destination' ? translate('playerFile.chooseDestination') : '';
}
