// ARIA v1.0 BLOCK 7.1 - Tutorial Modal Router
// This component routes to the correct tutorial based on type
// The actual tutorial logic is in ImageGenSetup, VoiceSetup

import ImageGenSetup from './ImageGenSetup';
import VoiceSetup from './VoiceSetup';

export default function TutorialModal({ type, onClose, onTest }) {
  // Route to the correct tutorial component
  switch (type) {
    case 'imageGen':
      return <ImageGenSetup onClose={onClose} onTest={onTest} />;

    case 'voice':
      return <VoiceSetup onClose={onClose} onTest={onTest} />;

    default:
      console.warn('[TutorialModal] Unknown tutorial type:', type);
      return null;
  }
}
