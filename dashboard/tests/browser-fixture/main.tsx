// Test-only entry: actual product component, isolated account and intercepted API.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../../app/dashboard';
import {DraftJournal,claimDraftTab} from '../../lib/draft-journal';
import {ActionJournal,createHistory,restoreHistory} from '../../lib/action-history';
import {recordRemovals,emptyHQState} from '../../lib/hq-state';
import '../../app/globals.css';
Object.assign(window,{HQTest:{DraftJournal,claimDraftTab,ActionJournal,createHistory,restoreHistory,recordRemovals,emptyHQState}});
createRoot(document.getElementById('root')!).render(<Dashboard accountId={new URLSearchParams(location.search).get('account')||'ci-user'} displayName="Test student" signedIn={true}/>);
