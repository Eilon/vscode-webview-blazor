import * as path from 'path';
import * as vscode from 'vscode';
import * as child from 'child_process';

export function activate(context: vscode.ExtensionContext) {
	let disposableWasm = vscode.commands.registerCommand('blazor-webview.startWasm', () => {
		BlazorPanel.createOrShow(context.extensionPath, BlazorType.Wasm);
	});

	let disposableServer = vscode.commands.registerCommand('blazor-webview.startServer', () => {
		BlazorPanel.createOrShow(context.extensionPath, BlazorType.Server);
	});

	context.subscriptions.push(disposableWasm);
	context.subscriptions.push(disposableServer);
}

export function deactivate() {}

enum BlazorType {
	Wasm,
	Server,
}

/**
 * Manages blazor webview panels
 */
 class BlazorPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static wasmPanel: BlazorPanel | undefined;
	public static serverPanel: BlazorPanel | undefined;

	private static readonly viewType = 'blazor';
	private static readonly wasmAppName = 'blazorApp';
	private static readonly serverAppName = 'blazorServerApp';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionPath: string;
	private readonly _blazorType: BlazorType;
	private _disposables: vscode.Disposable[] = [];
    private _res: child.ChildProcess | undefined;

	public static createOrShow(extensionPath: string, blazorType: BlazorType) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

		switch (blazorType) {
			case BlazorType.Wasm:
				// If we already have a panel, show it. Otherwise, create a new panel.
				if (BlazorPanel.wasmPanel) {
					BlazorPanel.wasmPanel._panel.reveal(column);
				} else {
					BlazorPanel.wasmPanel = new BlazorPanel(extensionPath, column || vscode.ViewColumn.One, blazorType);
				}
				break;
			case BlazorType.Server:
				// If we already have a panel, show it. Otherwise, create a new panel.
				if (BlazorPanel.serverPanel) {
					BlazorPanel.serverPanel._panel.reveal(column);
				} else {
					BlazorPanel.serverPanel = new BlazorPanel(extensionPath, column || vscode.ViewColumn.One, blazorType);
				}		
				break;
		}
	}

	private constructor(extensionPath: string, column: vscode.ViewColumn, blazorType: BlazorType) {
		this._extensionPath = extensionPath;
		this._blazorType = blazorType;
		
		switch (this._blazorType) {
			case BlazorType.Wasm:
				this._panel = vscode.window.createWebviewPanel(BlazorPanel.viewType, "Blazor (wasm)", column, {
					// Enable javascript in the webview
					enableScripts: true,

					// And restric the webview to only loading content from our extension's `media` directory.
					localResourceRoots: [
						vscode.Uri.file(path.join(this._extensionPath, BlazorPanel.wasmAppName))
					]
				});
				this._panel.webview.html = this._getHtmlForBlazorWasmWebview();
				break;
			case BlazorType.Server:
				this._panel = vscode.window.createWebviewPanel(BlazorPanel.viewType, "Blazor (server)", column);
				const exeBasePath = path.join(this._extensionPath, BlazorPanel.serverAppName, 'bin', 'debug', 'net7.0', 'publish') ;
				const exePath = path.join(exeBasePath, BlazorPanel.serverAppName + '.exe');

				this._res = child.execFile(exePath , 
					{
						cwd: exeBasePath
				  	});

				this._panel.webview.html = this._getHtmlForBlazorServerWebview();
				break;
			default:
				throw new Error("BlazorType not handled"); 
		}

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(message => {
			switch (message.command) {
			}
		}, null, this._disposables);
	}

	public dispose() {
		switch (this._blazorType) {
			case BlazorType.Wasm:
				BlazorPanel.wasmPanel = undefined;
				break;
			case BlazorType.Server:
				BlazorPanel.serverPanel = undefined;
				break;
			default:
				throw new Error("BlazorType not handled"); 
		}

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private buildWebViewUrl(path: string) {
		return 'https://file.no-authority.vscode-resource.vscode-cdn.net' + vscode.Uri.file(path).toString().substring(7);
	}

	private _getHtmlForBlazorWasmWebview() {
		const basePath = path.join(this._extensionPath, BlazorPanel.wasmAppName, 'bin', 'debug', 'net7.0', 'publish', 'wwwroot') + "\\";
		const baseUrl = this.buildWebViewUrl(basePath);

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();
		
		return `<!DOCTYPE html>
			<html lang="en">
			
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
				<title>blazorApp</title>
				<base href="/">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src https:; img-src vscode-resource: https: data:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src vscode-resource: 'unsafe-inline' http: https: data:; font-src https:">
				<link href="${baseUrl + 'css/bootstrap/bootstrap.min.css'}" rel="stylesheet" />
				<link href="${baseUrl + 'css/app.css" rel="stylesheet'}" />
				<link href="${baseUrl + BlazorPanel.wasmAppName + '.styles.css'}" rel="stylesheet" />
			</head>
			
			<body>
			<div id="app">Loading...</div>
				<div id="blazor-error-ui">
					An unhandled error has occurred. Please view <a href='https://github.com/rrelyea/vscode-webview-blazor/blob/main/README.md'>Readme</a>. (Most likely you need to launch from a custom build of VSCode, not Retail VSCode)
					<a href="" class="reload">Reload</a>
					<a class="dismiss">🗙</a>
				</div>
				<script nonce="${nonce}" src="${baseUrl}_framework/blazor.webassembly.js" autostart="false"></script>
				<script>
					window.getLocalResourceRoot = () => '${baseUrl}';
					Blazor.start({
						loadBootResource: (type, name, defaultUri, integrity) => \`${baseUrl}_framework/\${name}\`,
					});
				</script>
			</body>
			
			</html>`;
	}

	private _getHtmlForBlazorServerWebview() {
		const basePath = path.join(this._extensionPath, BlazorPanel.wasmAppName, 'bin', 'debug', 'net6.0', 'publish', 'wwwroot') + "\\";
		const baseUrl = this.buildWebViewUrl(basePath);

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();
		
		return `<!DOCTYPE html>
			<html lang="en">
			
			<head>
				<base href="${baseUrl}">
			</head>
			
			<body>
				<iframe src='http://localhost:5000/' style="position: absolute; width: 100%; height: 100%; border: none"/>
			</body>
			
			</html>`;
	}
}

function getNonce() {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}