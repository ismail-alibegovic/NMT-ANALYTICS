import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Input from '../../src/components/form/input/InputField';
import Select from '../../src/components/form/Select';
import { ThemeProvider, useTheme } from '../../src/context/ThemeContext';
import '../../src/index.css';
export function Controls() {
  const { toggleTheme } = useTheme();
  const [date, setDate] = useState('2027-07-15');
  const [time, setTime] = useState('08:30');
  const [number, setNumber] = useState('2');
  const [option, setOption] = useState('bus');
  return <main className="min-h-screen bg-white p-4 text-gray-900 dark:bg-gray-950 dark:text-white"><div className="mx-auto max-w-md space-y-4">
    <button onClick={toggleTheme}>Theme</button>
    <label htmlFor="date">Departure date</label><Input id="date" type="date" value={date} onChange={e=>setDate(e.target.value)} />
    <label htmlFor="time">Departure time</label><Input id="time" type="time" value={time} onChange={e=>setTime(e.target.value)} />
    <label htmlFor="count">Passengers</label><Input id="count" type="number" min="1" value={number} onChange={e=>setNumber(e.target.value)} />
    <label htmlFor="transport">Transport</label><Select id="transport" options={[{value:'bus',label:'Bus'},{value:'flight',label:'Flight'}]} value={option} onChange={setOption} />
    <button onClick={()=>{setDate('2027-07-15');setTime('08:30');setNumber('2');setOption('bus');}}>Reset values</button>
  </div></main>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><Controls /></ThemeProvider>);
