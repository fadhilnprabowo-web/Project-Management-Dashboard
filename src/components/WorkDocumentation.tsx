import React, { useRef } from 'react';
import { ImagePlus, Printer, Trash2 } from 'lucide-react';
import type { Project } from '../types';

export type DocumentationEntry = { id: string; caption: string; image: string };

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Foto gagal dibaca.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Format foto tidak didukung.'));
      image.onload = () => {
        const scale = Math.min(1, 1400 / image.width, 1400 / image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function WorkDocumentation({ project, entries, onChange }: { project: Project; entries: DocumentationEntry[]; onChange: (items: DocumentationEntry[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const added = await Promise.all(Array.from(files).filter(f => f.type.startsWith('image/')).map(async file => ({
        id: crypto.randomUUID(), caption: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), image: await compressPhoto(file)
      })));
      onChange([...entries, ...added]);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Foto gagal diproses.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const update = (id: string, caption: string) => onChange(entries.map(item => item.id === id ? { ...item, caption } : item));
  return <>
    <div className="pagehead"><div><h1>Dokumentasi Pekerjaan</h1><p>Kelola foto dan keterangan dokumentasi untuk {project.name}.</p></div><div className="head-actions"><label className="primary doc-upload"><ImagePlus size={15}/>Tambah foto<input ref={fileRef} type="file" accept="image/*" multiple onChange={e=>void addPhotos(e.target.files)}/></label><button className="secondary" onClick={()=>window.print()}><Printer size={15}/>Cetak / Simpan PDF</button></div></div>
    <article className="documentation-print">
      <header className="documentation-heading"><h1>DOKUMENTASI</h1><h2>PEKERJAAN</h2><p>{project.name}</p></header>
      {entries.length?<div className="documentation-grid">{entries.map((item,index)=><section className="documentation-item" key={item.id}><div className="documentation-caption">{item.caption||`DOKUMENTASI PEKERJAAN ${index+1}`}</div><img src={item.image} alt={item.caption||`Dokumentasi pekerjaan ${index+1}`}/><div className="documentation-edit"><input aria-label="Keterangan foto" value={item.caption} onChange={e=>update(item.id,e.target.value)} placeholder="Tulis keterangan pekerjaan"/><button className="icon" title="Hapus foto" onClick={()=>onChange(entries.filter(x=>x.id!==item.id))}><Trash2 size={15}/></button></div></section>)}</div>:<div className="documentation-empty"><ImagePlus size={26}/><p>Belum ada foto dokumentasi.</p><button className="secondary" onClick={()=>fileRef.current?.click()}>Pilih foto pekerjaan</button></div>}
    </article>
  </>;
}
