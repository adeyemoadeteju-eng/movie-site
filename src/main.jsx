import React,{useEffect} from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

function Startup(){
  useEffect(()=>{
    document.getElementById('boot-screen')?.remove();
  },[]);
  return <App/>;
}

const root=document.getElementById('root');
if(root){
  createRoot(root).render(<React.StrictMode><Startup/></React.StrictMode>);
}else{
  const status=document.getElementById('boot-status');
  if(status)status.textContent='AnimeDex could not find its app container. Reload the page to try again.';
  const retry=document.getElementById('boot-retry');
  if(retry)retry.style.display='inline-block';
}
