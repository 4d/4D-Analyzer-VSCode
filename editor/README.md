# 4D Analyzer

This extension developed by **[4D](https://www.4d.com/)** provides support for the **[4D language](https://developer.4d.com/docs/Concepts/about,)** through the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/).

## Features

Release numbers indicate the minimal 4D release where the feature is available.

- [Syntax Coloring](https://blog.4d.com/setting-up-code-syntax-highlighting-using-the-visual-studio-code-extension/) (4D 19 R6)
- [Signature helper](https://blog.4d.com/vs-code-go-to-definition-signature-help/) (4D 19 R7)
- [Go to definition](https://blog.4d.com/vs-code-go-to-definition-signature-help/) (4D 19 R7)
- [Auto completion](https://blog.4d.com/vs-code-extension-code-completion/) (4D 19 R8)
- [Document syntax checking](https://blog.4d.com/new-vs-code-editor-features-with-4d-v20/) (4D 20)
- [Code Folding](https://blog.4d.com/new-vs-code-editor-features-with-4d-v20/) (4D 20)
- [Indentation](https://blog.4d.com/new-vs-code-editor-features-with-4d-v20/) (4D 20)
- [Code formatting](https://blog.4d.com/format-your-4d-code-in-visual-studio-code/) (4D 20 R2)
- [Show Documentation](https://blog.4d.com/vs-code-extension-show-4d-documentation/) (4D 20 R3)
- [Workspace syntax checking](https://blog.4d.com/workspace-syntax-checking-in-vs-code-editor/) (4D 20 R5)

## Quick start

1. Install a **4D**, **4D Server** or **tool4d** application on your computer. **tool4d** free download links: [Windows](https://product-download.4d.com/release/20%20Rx/latest/latest/win/tool4d_v20R2_win.tar.xz), [macOS Intel](https://product-download.4d.com/release/20%20Rx/latest/latest/mac/tool4d_v20R3_mac_x86.tar.xz), [macOS Silicon](https://product-download.4d.com/release/20%20Rx/latest/latest/mac/tool4d_v20R3_mac_arm.tar.xz).
1. Install the 4D Analyzer extension in VS Code.
1. Set the path of the application executable to **4D-Analyzer.Server.path**.

More information on installation in this [4D Blog post](https://blog.4d.com/a-brand-new-visual-studio-code-extension-at-your-disposal/).
All 4D blog posts about this extension are available [here](https://blog.4d.com/tag/vscode/).

## Configuration

This extension provides configurations through VSCode's configuration settings. 
All configurations are under __4D-Analyzer.*__.
See the VSCode manual for more information on specific configurations.

### Extension Settings

- **Diagnostics: Enable**
  - Setting: 4D-Analyzer.diagnostics.enable
  - Values: true (default) / false
  - Enables/disables the automatic Syntax Checking.

- **Diagnostics: Scope**
  - Setting: 4D-Analyzer.diagnostics.scope
  - Values: "Workspace" (default) / "Document"
  - Specifies if the Syntax Checling is performed on the current workspace or on the current document only.

- **Server: Path**
  - Setting: 4D-Analyzer.server.path
  - Values: path
  - Path to the **4D**, **4D Server** or **tool4d** application to use as LSP server.

- **Trace: Server**
  - Setting: 4D-Analyzer.trace.server
  - Values: "off" (default) / "messages" / "verbose"
  - For debugging purposes. Defines the level of information logged in the output panel.

### 4D Code Stylesheets

To display 4D code with the default 4D stylesheets, insert this property in the VSCode User settings.json file:
```json
"editor.semanticTokenColorCustomizations": {
    "[Default Light+]": {
        "enabled": true,
        "rules": {
            "*:4d": {
                "foreground": "#000000",
                "bold": false,
                "italic": false,
                "underline": false,
                "strikethrough": false
            },
            "method:4d": {
                "foreground": "#000088",
                "bold": true,
                "italic": true
            },
            "method.defaultLibrary:4d": {
                "foreground": "#068c00",
                "italic": false
            },
            "method.plugin:4d": {
                "foreground": "#000000"
            },
            "property:4d": {
                "foreground": "#a0806b"
            },
            "function:4d": {
                "foreground": "#5f8e5e",
                "italic": true
            },
            "parameter:4d": {
                "foreground": "#000b76",
                "bold": true
            },
            "variable.interprocess:4d": {
                "foreground": "#ff0088"
            },
            "variable.process:4d": {
                "foreground": "#0000ff"
            },
            "variable.local:4d": {
                "foreground": "#0031ff"
            },
            "keyword:4d": {
                "foreground": "#034d00",
                "bold": true
            },
            "table:4d": {
                "foreground": "#532300"
            },
            "field:4d": {
                "foreground": "#323232"
            },
            "comment:4d": {
                "foreground": "#535353"
            },
            "type:4d": {
                "foreground": "#068c00",
                "bold": true
            },
            "constant:4d": {
                "foreground": "#4d004d",
                "underline": true
            },
            "string:4d": {
                "foreground": "#000000"
            },
            "error:4d": {
                "foreground": "#ff0000",
                "bold": true,
                "italic": true
            }
        }
    },
    "[Default Dark+]": {
        "enabled": true,
        "rules": {
            "*:4d": {
                "foreground": "#FFFFFF",
                "bold": false,
                "italic": false,
                "underline": false,
                "strikethrough": false
            },
            "method:4d": {
                "foreground": "#1B79F3",
                "bold": true,
                "italic": true
            },
            "method.defaultLibrary:4d": {
                "foreground": "#59BB00",
                "italic": false
            },
            "method.plugin:4d": {
                "foreground": "#BFBFBF"
            },
            "property:4d": {
                "foreground": "#A0806B"
            },
            "function:4d": {
                "foreground": "#4EC36E",
                "italic": true
            },
            "parameter:4d": {
                "foreground": "#0C70FF",
                "bold": true
            },
            "variable.interprocess:4d": {
                "foreground": "#FF0088"
            },
            "variable.process:4d": {
                "foreground": "#53B0EB"
            },
            "variable.local:4d": {
                "foreground": "#18B3F1"
            },
            "keyword:4d": {
                "foreground": "#575757",
                "bold": true
            },
            "table:4d": {
                "foreground": "#CF5600"
            },
            "field:4d": {
                "foreground": "#9C6765"
            },
            "comment:4d": {
                "foreground": "#8F8F8F"
            },
            "type:4d": {
                "foreground": "#59BB00",
                "bold": true
            },
            "constant:4d": {
                "foreground": "#FA647F",
                "underline": true
            },
            "string:4d": {
                "foreground": "#FFFFFF"
            },
            "error:4d": {
                "foreground": "#ff0000",
                "bold": true,
                "italic": true
            }
        }
    }
}
```
