'use client';

interface AdOverlayProps {
  showAd: boolean;
  currentAd: any;
}

export default function AdOverlay({ showAd, currentAd }: AdOverlayProps) {
  if (!showAd || !currentAd) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'black',
        zIndex: 999999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {currentAd.type === 'image' ? (
        <img
          src={currentAd.url}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      ) : (
        <video
          src={currentAd.url}
          autoPlay
          muted
          playsInline
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      )}
    </div>
  );
}
