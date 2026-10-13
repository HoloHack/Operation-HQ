import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) return <main className="signin-surface"><div className="signin-stamp" aria-hidden="true">hq</div><span className="eyebrow">Operation HQ · Your study desk</span><h1>A place to begin.<br/>And keep going.</h1><p>Sign in to open your tasks, notes and plans. Nothing is imported from your browser until you choose to connect it.</p><a className="primary-action" href={chatGPTSignInPath("/")} target="_top">Sign in with ChatGPT</a></main>;
  return <Dashboard key={user.userId} displayName={user.fullName?.split(" ")[0] || "there"} signedIn={true} accountId={user.userId} />;
}
