import React from 'react';

const AgentNetwork: React.FC = () => {
  const commissionMatrix: number[][] = [
    [0.1, 0.2, 0.3],
    [0.2, 0.3, 0.4],
    [0.3, 0.4, 0.5],
  ];

  return (
    <div>
      <h1>Agent Network Commission Matrix</h1>
      <table className='border-collapse border border-gray-300 w-full'>
        <thead>
          <tr>
            <th className='border border-gray-300 p-2'></th>
            <th className='border border-gray-300 p-2'>Level 1</th>
            <th className='border border-gray-300 p-2'>Level 2</th>
            <th className='border border-gray-300 p-2'>Level 3</th>
          </tr>
        </thead>
        <tbody>
          {commissionMatrix.map((row, i) => (
            <tr key={i} className='border border-gray-300'>
              <td className='border border-gray-300 p-2'>Agent {i + 1}</td>
              {row.map((cell, j) => (
                <td key={j} className='border border-gray-300 p-2'>{(cell * 100).toFixed(2)}%</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AgentNetwork;