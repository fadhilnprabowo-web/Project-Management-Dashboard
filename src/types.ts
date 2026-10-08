export type Approval={firstCompany:string;firstName:string;firstPosition:string;firstSignature:string;secondCompany:string;secondName:string;secondPosition:string;secondSignature:string};
export type Project={id:string;name:string;number:string;client:string;location:string;manager:string;engineer:string;contractor:string;consultant:string;start:string;finish:string;value:number;status:string;description:string;archived?:boolean;logo?:string;approval:Approval;beritaAcara?:Record<string,string>;documentation?:{id:string;caption:string;image:string}[]};
export type Row=Record<string,any>&{id:string;projectId:string};
export type Store={projects:Project[];wbs:Row[];progress:Row[];activities:Row[];issues:Row[];materials:Row[];settings:{dark:boolean;defaultProject:string}};
