import React from 'react';
import type { Project } from '../types';
import { formatPercent } from '../utils/format';

type Fields = {
  date: string; workName: string; spk: string; projectName: string;
  firstCompany: string; firstName: string; firstPosition: string;
  secondCompany: string; secondName: string; secondPosition: string;
  inspection: string; progressDate: string; progress: string; closing: string;
};

const numberWords = (n: number): string => {
  const ones = ['nol','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan'];
  if (n < 10) return ones[n] || '';
  if (n === 10) return 'sepuluh';
  if (n === 11) return 'sebelas';
  if (n < 20) return `${numberWords(n - 10)} belas`;
  if (n < 100) return `${numberWords(Math.floor(n / 10))} puluh${n % 10 ? ` ${numberWords(n % 10)}` : ''}`;
  if (n === 100) return 'seratus';
  if (n < 200) return `seratus${n % 100 ? ` ${numberWords(n % 100)}` : ''}`;
  if (n < 1000) return `${numberWords(Math.floor(n / 100))} ratus${n % 100 ? ` ${numberWords(n % 100)}` : ''}`;
  if (n === 1000) return 'seribu';
  if (n < 2000) return `seribu${n % 1000 ? ` ${numberWords(n % 1000)}` : ''}`;
  return `${numberWords(Math.floor(n / 1000))} ribu${n % 1000 ? ` ${numberWords(n % 1000)}` : ''}`;
};

const dateText = (value: string) => {
  if (!value) return '................................';
  const d = new Date(`${value}T00:00:00`);
  const month = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(d);
  return `${numberWords(d.getDate())} ${month} tahun ${numberWords(d.getFullYear())}`;
};

export default function BeritaAcara({ project, progress, onChange }: { project: Project; progress: number; onChange: (key: string, value: any) => void }) {
  const saved = project.beritaAcara || {};
  const defaults: Fields = {
    date: new Date().toISOString().slice(0, 10), workName: project.name, spk: project.number || '', projectName: project.name,
    firstCompany: project.approval?.firstCompany || project.client || '', firstName: project.approval?.firstName || '', firstPosition: project.approval?.firstPosition || '',
    secondCompany: project.approval?.secondCompany || project.contractor || '', secondName: project.approval?.secondName || project.engineer || '', secondPosition: project.approval?.secondPosition || '',
    inspection: `TELAH MENGADAKAN PEMERIKSAAN BERSAMA ATAS PEKERJAAN ${project.name}, yang berlokasi di ${project.location || '................................'}.`,
    progressDate: new Date().toISOString().slice(0, 10), progress: String(progress.toFixed(2)),
    closing: 'Demikian berita acara prestasi pekerjaan ini dibuat untuk dapat dipergunakan sebagaimana mestinya.'
  };
  const v = { ...defaults, ...saved } as Fields;
  const fields: [keyof Fields, string, 'input' | 'textarea'][] = [
    ['date','Tanggal berita acara','input'],['workName','Nama pekerjaan','input'],['spk','Nomor SPK','input'],['projectName','Nama proyek','input'],
    ['firstCompany','Perusahaan pihak pertama','input'],['firstName','Nama pihak pertama','input'],['firstPosition','Jabatan pihak pertama','input'],
    ['secondCompany','Perusahaan pihak kedua','input'],['secondName','Nama pihak kedua','input'],['secondPosition','Jabatan pihak kedua','input'],
    ['inspection','Uraian pemeriksaan','textarea'],['progressDate','Tanggal prestasi','input'],['progress','Prestasi pekerjaan (%)','input'],['closing','Kalimat penutup','textarea']
  ];
  const edit = (key: keyof Fields, value: string) => onChange('beritaAcara', { ...v, [key]: value });
  return <>
    <div className="ba-toolbar"><p>Ubah isi berita acara di sini. Data tersimpan otomatis untuk proyek aktif.</p><button className="primary" onClick={() => window.print()}>Cetak / Simpan PDF</button></div>
    <div className="ba-layout">
      <section className="panel ba-editor"><h2>Isi Berita Acara</h2><div className="form-grid">{fields.map(([key,title,type])=><label key={key}>{title}{type==='textarea'?<textarea rows={3} value={v[key]} onChange={e=>edit(key,e.target.value)}/>:<input type={['date'].includes(key)?'date':'text'} value={v[key]} onChange={e=>edit(key,e.target.value)}/>}</label>)}</div></section>
      <article className="ba-paper ba-print">
        <h1>BERITA ACARA PRESTASI PEKERJAAN</h1>
        <div className="ba-meta"><b>Pekerjaan</b><span>: {v.workName}</span><b>Proyek</b><span>: {v.projectName}</span><b>SPK</b><span>: {v.spk || '—'}</span></div>
        <p className="ba-intro">Pada hari ini, tanggal <b>{dateText(v.date)}</b>, kami yang bertanda tangan di bawah ini:</p>
        <div className="ba-parties"><p>1. <b>{v.firstName || '................................'}</b><br/><span>Jabatan: {v.firstPosition || '................................'}<br/>Perusahaan: {v.firstCompany || '................................'}</span></p><p>2. <b>{v.secondName || '................................'}</b><br/><span>Jabatan: {v.secondPosition || '................................'}<br/>Perusahaan: {v.secondCompany || '................................'}</span></p></div>
        <p className="ba-body">{v.inspection}</p>
        <p className="ba-result">PRESTASI PEKERJAAN S.D. TANGGAL {dateText(v.progressDate).toUpperCase()} ADALAH <b>{formatPercent(Number(v.progress))}</b></p>
        <p className="ba-body">{v.closing}</p>
        <div className="ba-signatures"><div><b>PIHAK PERTAMA</b><strong>{v.firstCompany}</strong><div className="ba-sign-space"/><u>{v.firstName || '................................'}</u><span>{v.firstPosition}</span></div><div><b>PIHAK KEDUA</b><strong>{v.secondCompany}</strong><div className="ba-sign-space"/><u>{v.secondName || '................................'}</u><span>{v.secondPosition}</span></div></div>
      </article>
    </div>
  </>;
}
