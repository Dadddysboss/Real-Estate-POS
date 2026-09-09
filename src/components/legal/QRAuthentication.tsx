import React from 'react';

const QRAuthentication: React.FC = () => {
  // Generate and display the QR code using a simple inline SVG or canvas element
  const qrCodeSVG = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'><rect x='0' y='0' width='24' height='24' fill='#000'/></svg>`;

  return (
    <div>
      <h1>Legal Vault QR Authentication</h1>
      <img src={qrCodeSVG} alt='QR Code' className='w-24 h-24' />
    </div>
  );
};

export default QRAuthentication;