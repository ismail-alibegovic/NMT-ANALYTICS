import { useEffect, useId, useRef, useState } from 'react';
import api, { get } from '../../lib/apiClient';
import { useT } from '../../lib/i18n/context';
import Button from '../ui/button/Button';
import { Modal } from '../ui/modal';

interface ImportModalProps {
  entity: 'customers' | 'packages';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}
interface ImportResult {
  total: number; importedCount?: number; validCount?: number; invalidCount: number;
  invalidRows: { row: number; errors: unknown }[];
  preview?: Record<string, unknown>[];
}

// An opening owns its draft. Closing unmounts the session, including file input state.
export default function ImportModal(props: ImportModalProps) {
  return props.isOpen ? <ImportSession key={props.entity} {...props}/> : null;
}
function ImportSession({entity,onClose,onSuccess}:ImportModalProps) {
  const {t}=useT(); const c=t.fileImport; const id=useId();
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<ImportResult|null>(null);
  const [result,setResult]=useState<ImportResult|null>(null);
  const [error,setError]=useState('');
  const [phase,setPhase]=useState<'preview'|'import'|null>(null);
  const pending=useRef(false), version=useRef(0), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const close=()=>{if(!pending.current)onClose();};
  const body=(selected:File)=>{const value=new FormData();value.append('file',selected);value.append('mode','insert');return value;};
  const readPreview=async(selected:File)=>{
    if(pending.current)return;
    const request=++version.current;setFile(selected);setResult(null);setPreview(null);setError('');
    if(!/\.(csv|xlsx)$/i.test(selected.name)||selected.size>10*1024*1024){setError(c.fileError);setPhase(null);return;}
    setPhase('preview');
    try {
      const response=await api.post<{results:ImportResult}>(`/import/${entity}?dryRun=true`,body(selected),{headers:{'Content-Type':'multipart/form-data'}});
      if(mounted.current&&request===version.current){setPreview(response.data.results);if(response.data.results.invalidCount)setError(c.invalidFile);}
    } catch(err:unknown){if(mounted.current&&request===version.current)setError((err as {response?:{data?:{message?:string}}}).response?.data?.message||c.previewError);}
    finally{if(mounted.current&&request===version.current)setPhase(null);}
  };
  const submit=async()=>{
    if(pending.current||!file||!preview||preview.invalidCount||phase)return;
    pending.current=true;setPhase('import');setError('');
    try{
      const response=await api.post<{results:ImportResult}>(`/import/${entity}`,body(file),{headers:{'Content-Type':'multipart/form-data'}});
      if(mounted.current){setResult(response.data.results);if((response.data.results.importedCount||0)>0)onSuccess();}
    }catch(err:unknown){
      const data=(err as {response?:{data?:{message?:string;results?:ImportResult}}}).response?.data;
      if(mounted.current){if(data?.results){setPreview(data.results);}setError(data?.message||c.saveError);}
    }finally{pending.current=false;if(mounted.current)setPhase(null);}
  };
  const download=async()=>{
    try{const response=await get<Blob>(`/import/${entity}/template.csv`,{responseType:'blob'});const url=URL.createObjectURL(response.data);const link=document.createElement('a');link.href=url;link.download=`${entity}_template.csv`;link.click();URL.revokeObjectURL(url);}
    catch{if(mounted.current)setError(c.templateError);}
  };
  const rows=preview?.preview||[]; const headers=Object.keys(rows[0]||{});
  return <Modal isOpen onClose={close} className="m-4 max-w-4xl" title={`${c.title} ${entity==='customers'?c.customers:c.packages}`}>
    <form aria-label={c.title} className="max-h-[75vh] overflow-y-auto p-6" onSubmit={event=>{event.preventDefault();void submit();}}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 p-4 dark:bg-brand-500/15"><p className="text-sm">{c.templateDescription}</p><Button variant="outline" size="sm" onClick={()=>void download()}>{c.downloadTemplate}</Button></div>
      <fieldset disabled={phase==='import'} className="min-w-0 space-y-4">
        <label htmlFor={id} className="block text-sm font-medium">{c.selectFile}</label>
        <input id={id} type="file" accept=".csv,.xlsx" onChange={event=>{const selected=event.target.files?.[0];if(selected)void readPreview(selected);}} className="block min-h-11 w-full rounded-lg border border-gray-300 bg-gray-50 text-sm file:mr-3 file:border-0 file:px-3 file:py-3 dark:border-gray-700 dark:bg-gray-800"/>
        {phase==='preview'&&<p role="status">{c.reading}</p>}
        {rows.length>0&&<div><h3 className="mb-2 text-sm font-medium">{c.preview}</h3><div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"><table className="w-full text-left text-sm"><thead><tr>{headers.map(key=><th className="px-3 py-2" key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{headers.map(key=><td className="max-w-xs break-words border-t border-gray-200 px-3 py-2 dark:border-gray-700" key={key}>{String(row[key]??'')}</td>)}</tr>)}</tbody></table></div></div>}
        {!!preview?.invalidRows.length&&<ul className="space-y-2 text-sm">{preview.invalidRows.slice(0,10).map((row,index)=><li key={index}>{c.row} {row.row}: {JSON.stringify(row.errors)}</li>)}</ul>}
        {result&&<p role="status">{c.imported}: {result.importedCount||0} / {result.total}</p>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700"><Button variant="outline" onClick={close}>{t.common.cancel}</Button>{file&&error&&!pending.current&&<Button variant="outline" onClick={()=>void readPreview(file)}>{c.retryPreview}</Button>}<Button type="submit" disabled={!preview||!!preview.invalidCount||!!phase||!!result}>{phase==='import'?c.importing:c.title}</Button></div>
      </fieldset>
      {error&&<p role="alert" className="mt-4 text-sm text-error-600 dark:text-error-400">{error}</p>}
    </form>
  </Modal>;
}
