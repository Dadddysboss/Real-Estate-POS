import React, { useState } from 'react';

const WhatsAppGateway: React.FC = () => {
  const [message, setMessage] = useState<string>('');

  const sendMessage = () => {
    // Simulate sending a message
    console.log('Message sent:', message);
    setMessage('');
  };

  return (
    <div>
      <h1>WhatsApp Gateway</h1>
      <input
        type='text'
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button onClick={sendMessage}>Send Message</button>
    </div>
  );
};

export default WhatsAppGateway;