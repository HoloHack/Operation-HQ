// Test-only entry: actual product component, isolated account and intercepted API.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../../app/dashboard';
import {DraftJournal,claimDraftTab} from '../../lib/draft-journal';
import '../../app/globals.css';
Object.assign(window,{HQTest:{DraftJournal,claimDraftTab}});
createRoot(document.getElementById('root')!).render(<Dashboard accountId={new URLSearchParams(location.search).get('account')||'ci-user'} displayName="Test student" signedIn={true}/>);
