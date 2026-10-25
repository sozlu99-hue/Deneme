export function bindDialogViewport(dialog,{window:win=window}={}){
 const viewport=win.visualViewport;
 const sync=()=>{
  const height=viewport?.height||win.innerHeight;
  dialog.style.setProperty('--dialog-viewport-height',height+'px');
  dialog.style.setProperty('--dialog-viewport-top',(viewport?.offsetTop||0)+'px');
  dialog.dataset.keyboardOpen=String(win.innerHeight-height>100);
 };
 sync();win.addEventListener('resize',sync);viewport?.addEventListener('resize',sync);viewport?.addEventListener('scroll',sync);
 return()=>{win.removeEventListener('resize',sync);viewport?.removeEventListener('resize',sync);viewport?.removeEventListener('scroll',sync);};
}
