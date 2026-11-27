const vscode = require('vscode');
const {randomBytes} = require('node:crypto');
const {posix} = require('node:path');
const {render,esc} = require('./viewer');
const {maxArchive} = require('./model');
function activate(context) {
  const provider = {
    openCustomDocument(uri) { return {uri, dispose() {}}; },
    async resolveCustomEditor(doc, panel) {
      panel.webview.options = {enableScripts:true, localResourceRoots:[]};
      const update = async () => {
        const revision = ++generation;
        let html;
        try {
          const stat=await vscode.workspace.fs.stat(doc.uri);
          if (stat.size>maxArchive) throw Error('SLX files up to 64 MiB are supported.');
          const data=await vscode.workspace.fs.readFile(doc.uri);
          html=render(data,posix.basename(doc.uri.path),true,randomBytes(16).toString('hex'));
        } catch (error) {
          html='<html><head><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;"></head><body><p>Could not open the SLX diagram.</p><pre>'+esc(error.message)+'</pre></body></html>';
        }
        if (!closed && revision===generation) panel.webview.html=html;
      };
      let generation=0, closed=false;
      const watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(doc.uri,'..'),posix.basename(doc.uri.path)));
      watcher.onDidChange(update); watcher.onDidCreate(update); watcher.onDidDelete(update);
      panel.onDidDispose(()=>{closed=true;watcher.dispose();});
      await update();
    }
  };
  context.subscriptions.push(vscode.window.registerCustomEditorProvider('slxViewer.diagram',provider,{supportsMultipleEditorsPerDocument:true}));
}
module.exports={activate};
