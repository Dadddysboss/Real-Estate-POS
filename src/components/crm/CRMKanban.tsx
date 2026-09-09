import React, { useState } from 'react';

const CRMKanban: React.FC = () => {
  const [siteVisits, setSiteVisits] = useState<{ date: string; time: string; agent: string }[]>([]);

  const scheduleVisit = (date: string, time: string, agent: string) => {
    const newVisit = { date, time, agent };
    setSiteVisits([...siteVisits, newVisit]);
  };

  return (
    <div>
      <h1>CRM Kanban - Site Visit Scheduling</h1>
      <button
        onClick={() =>
          scheduleVisit(
            '2023-10-01',
            '10:00 AM',
            'John Doe'
          )
        }
        className='bg-blue-500 text-white p-2 rounded'
      >
        Schedule Visit
      </button>
      <ul className='list-disc pl-4 mt-2'>
        {siteVisits.map((visit, index) => (
          <li key={index} className='mt-1'>
            Date: {visit.date}, Time: {visit.time}, Agent: {visit.agent}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CRMKanban;