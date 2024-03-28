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

## Quick start

1. Install the 4D Analyzer extension in VS Code.
1. Open a 4D project folder or a 4D method (.4dm) file.

All 4D blog posts about this extension are available [here](https://blog.4d.com/tag/vscode/).

## Configuration

This extension provides configurations through VSCode's configuration settings. 
All configurations are under __4D-Analyzer.*__.
See the VSCode manual for more information on specific configurations.
More precision on automatic **tool4d** download and use in [this 4D blog post](https://blog.4d.com/auto-tool4d-download-in-4d-analyzer-extension-for-vs-code).

### Extension Settings

- **Tool4d: Enable**
  - Setting: 4D-Analyzer.server.tool4d.enable
  - Values: true (default) / false
  - Enables/disables the automatic **tool4d** download and use.

- **Tool4d: Version**
  - Setting: 4D-Analyzer.server.tool4d.version
      - only has an impact when the "Automatic download and use of tool4d" parameter is activated.
  - Values: "latest" (default) / Version as string
  - Defines the [**tool4d** version](In the new "Warnings" page, ) to use:
    - "latest" corresponds to the latest global version of **tool4d**. This is the default value and the best way to ensure you're always up to date. Versions will be downloaded as they are released, including HotFix versions.
    - "20R" corresponds to the latest **tool4d** 20 Feature Release version, including HotFix versions.
    - "20R4" corresponds to the latest version of **tool4d** 20 R4. This will limit the download to 20 R4, including HotFix versions, when available. Of course, you can specify "20R5", "20R6," and so on as they become available.
    - "20" means the latest version of **tool4d** 20 Long Term Service, including HotFix versions. Of course, you can specify "21", "22" and so on as they become available.

- **Tool4d: Channel**
  - Setting: 4D-Analyzer.server.tool4d.channel
      - only has an impact when the "Automatic download and use of tool4d" parameter is activated.
  - Values: "stable" (default) / "beta"
  - Defines the **tool4d** version channel to use.

- **Tool4d: Location**
  - Setting: 4D-Analyzer.server.tool4d.location
      - only has an impact when the "Automatic download and use of tool4d" parameter is activated.
  - Values: path
  - Optional. Defines a custom location where the downloaded **tool4d** will be placed on disk.

- **Server: Path**
  - Setting: 4D-Analyzer.server.path
      - only has an impact when the "Automatic download and use of tool4d" parameter is deactivated.
  - Values: path
  - Path to the local **4D**, **4D Server** or **tool4d** application to use as LSP server.

- **Diagnostics: Enable**
  - Setting: 4D-Analyzer.diagnostics.enable
  - Values: true (default) / false
  - Enables/disables the automatic Syntax Checking.

- **Trace: Server**
  - Setting: 4D-Analyzer.trace.server
  - Values: "off" (default) / "messages" / "verbose"
  - For debugging purposes. Defines the level of information logged in the output panel.

### Use custom local 4D application

1. Install a **4D**, **4D Server** or **tool4d** application on your computer. For example, here is the free download link for [**tool4d**](https://product-download.4d.com/?branch=All&flag=All&version_number=All&platform=All&type=tool).
1. Deactivate the "Automatic download and use of tool4d" setting (**4D-Analyzer.server.tool4d.enable**).
1. Set the path of the application executable to **4D-Analyzer.Server.path**.
More information on this kind of installation in this [4D Blog post](https://blog.4d.com/a-brand-new-visual-studio-code-extension-at-your-disposal/).

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
