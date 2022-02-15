# Makedoc

Creates markdown documentation ready to be uploaded to Confluence using [mark](https://github.com/kovetskiy/mark) tool.

Scans folder to create Markdown files to be uploaded.
Supports package.json/makedoc section.

## Configure mark

```
cat ~/.config/mark
username = "user.name@domain.com" 
password = "123"
base_url = "https://workspace.atlassian.net/wiki"
```

## Configure your project package.json

```
{
  ...
  makedoc: {
    gitBaseUrl: "https://github.com/huksley/makedoc/",
    config.confluenceSpaceId: "Docs", 
    config.rootFolder: ".",
    ignoredMarkdownFiles: ["PULL_REQUEST_TEMPLATE.md", "CODEOWNERS.md", "LICENSE.md", "CONTRIBUTING.md" ],
    output: "out",
    exclude: "node_modules",
    title: "makedoc", // {basename rootFolder}
    jsdoc: []// [{ dir: "doc", title: "Docs" }]
  }
  ...
}
```


# Go into the project folder
node ../makedoc/index 
```
