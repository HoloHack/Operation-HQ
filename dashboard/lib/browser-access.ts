export const browserTools={bookmarks:'Bookmarks',gmail:'Gmail',tabs:'Tab groups',gleam:'Gleam',settings:'Advanced settings',nexus:'Browser tools'} as const;
export type BrowserTool=keyof typeof browserTools;
/** Accept only known companion routes, never URLs or arbitrary panel IDs. */
export const isBrowserTool=(value:unknown):value is BrowserTool=>typeof value==='string'&&Object.hasOwn(browserTools,value);
/** Capitalize the signed-in account’s first name without altering its profile. */
export const displayFirstName=(value:string)=>{const name=value.trim().split(/\s+/)[0]||'there';return name.charAt(0).toLocaleUpperCase()+name.slice(1);};
/** Turn bridge failures into visible setup guidance while preserving specific errors. */
export function bridgeProblem(error:unknown,enabled?:boolean){
 const raw=error instanceof Error?error.message:String(error||'The companion did not respond.');
 if(enabled===false||/Enable dashboard access/i.test(raw))return {state:'disabled' as const,title:'Allow this dashboard in the companion',detail:'The companion is installed, but dashboard access is switched off. Open its toolbar popup, enable Allow dashboard access, then retry.'};
 if(/receiving end does not exist|not available|could not establish|Extension did not respond|Extension connection failed/i.test(raw))return {state:'missing' as const,title:'Connect your browser companion',detail:'This Chrome profile could not reach the Operation HQ companion. Install or reload the current companion in this same profile, then enable Allow dashboard access in its popup. A website cannot directly read Chrome bookmarks or the extension’s Gmail connection.'};
 return {state:'missing' as const,title:'The browser tool could not open',detail:raw};
}
