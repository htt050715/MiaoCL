import type { ConfigDocument,ConfigScope } from '@shared/clientConfigs'
export interface ConfigDraft {documents:Record<string,ConfigDocument>;originals:Record<string,string>;file:string;scope:ConfigScope}
// Keep edits while the user visits the bridge status or another launcher page.
const drafts=new Map<string,ConfigDraft>()
export const draftKey=(target:{id:string;folder:string}|undefined)=>target?JSON.stringify([target.folder,target.id]):''
export function storeDraft(key:string,draft:ConfigDraft){if(!key)return;if(drafts.size>=8&&!drafts.has(key))return;drafts.set(key,draft)}
export const readDraft=(key:string)=>drafts.get(key)
