const os = require("os");
const fs = require("fs");
const path = require("path");
const marked = require("marked");
const R = require("ramda");
const jsdoc2md = require("jsdoc-to-markdown");
const cmd = require("commander");

const DEFAULT_EXCLUDES = [ "node_modules" ]

cmd
  .option("-o, --o <dir>", "output directory", "./out")
  .option("-i, --input <dir>", "input directory", "./")
  .option("--space <space-id>", "Confluence space id (Docs)")
//  .option("-y, --dry", "Dry run, don't write anything")
//  .option("-W, --wipe", "Wipe output folder before writing")
  .option("-X, --exclude <path1>,<path2>...", "Directories or files to ignore", DEFAULT_EXCLUDES.join(","))

cmd.parse(process.argv);

const capitalize = s => {
  if (typeof s !== "string") return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const titleize = s => {
  return capitalize(s)
    .replace("-", " ")
    .replace("_", " ");
};

let config = {};
config.confluenceSpaceId = cmd.space || "Docs" 
config.rootFolder = path.resolve(cmd.input || ".");

if (fs.existsSync(config.rootFolder + "/package.json")) {
  const folderPackage = JSON.parse(
    fs.readFileSync(config.rootFolder + "/package.json", { encoding: "utf-8" })
  );
  config = Object.assign(config, folderPackage.makedoc || {});
  if (folderPackage.repository && folderPackage.repository.url) {
    config.gitBaseUrl = folderPackage.repository.url
    config.gitBaseUrl = config.gitBaseUrl.replace(/\.git$/, "/")
    config.gitBaseUrl = config.gitBaseUrl.replace(/^git\+https/, "https")
    config.gitBaseUrl = config.gitBaseUrl.replace(/^git\@/, "https://")
  }
}

config.ignoredMarkdownFiles = config.ignoredMarkdownFiles || [
  "PULL_REQUEST_TEMPLATE.md",
  "CODEOWNERS.md",
  "LICENSE.md",
  "CONTRIBUTING.md"
];
config.jsdoc = config.jsdoc || (cmd.jsdoc ? cmd.jsdoc.split(",") : []);
config.title = config.title || titleize(path.basename(config.rootFolder));
config.output = path.resolve(cmd.output || "out");
config.exclude = config.exclude || (cmd.exclude ? cmd.exclude.split(",") : DEFAULT_EXCLUDES);

/**
 * Consume file or folder recursively.
 *
 * @param {string} source - Starting path-like
 * @param {Function} consumer - Consumer for paths
 * @param {Function} acceptor - Optional acceptor to check before consuming paths, if true-like will pass to consumer.
 * @param {Function} dirAcceptor - Optional acceptor to check before consuming dirs, if true-like will continue recursively.
 */
function consumeFiles(source, consumer, acceptor, dirAcceptor, rootPath) {
  if (!fs.existsSync(source)) {
    throw new Error("Not found: " + source);
  }

  const stat = fs.lstatSync(source);
  if (
    stat.isDirectory() &&
    (dirAcceptor === undefined || dirAcceptor(source))
  ) {
    const files = fs.readdirSync(source);
    files.forEach(file => {
      const currentPath = path.join(source, file);
      if (fs.lstatSync(currentPath).isDirectory()) {
        consumeFiles(
          currentPath,
          consumer,
          acceptor,
          dirAcceptor,
          rootPath ? rootPath : source
        );
      } else if (acceptor === undefined || acceptor(currentPath)) {
        consumer(currentPath, rootPath);
      }
    });
  } else if (acceptor === undefined || acceptor(source)) {
    consumer(source, rootPath);
  }
}

function meaning(targetDir, file) {
  const content = fs.readFileSync(file, { encoding: "utf-8" });
  const tokens = marked.lexer(content, {});

  const defaultTitle = R.defaultTo({
    text:
      path.basename(file) === "README.md"
        ? titleize(path.basename(path.dirname(file)))
        : titleize(path.basename(file).replace(".md", ""))
  });

  // # Title or file-name
  const title = defaultTitle(
    R.head(tokens.filter(t => t.type === "heading" && t.depth === 1))
  ).text;

  const comments = tokens.filter(
    t => t.type === "html" && t.text.startsWith("<!--")
  );

  // Existing wiki space
  const wikiSpace = R.head(
    comments
      .filter(c => c.text.indexOf("Space:") >= 0)
      .map(c =>
        c.text
          .substring(c.text.indexOf(":") + 1)
          .replace("-->", "")
          .trim()
      )
  );

  // Existing wiki title
  const wikiTitle = R.head(
    comments
      .filter(c => c.text.indexOf("Title:") >= 0)
      .map(c =>
        c.text
          .substring(c.text.indexOf(":") + 1)
          .replace("-->", "")
          .trim()
      )
  );

  const wikiSkip = R.head(
    comments
      .filter(c => c.text.indexOf("Skip:") >= 0)
      .map(c =>
        c.text
          .substring(c.text.indexOf(":") + 1)
          .replace("-->", "")
          .trim()
      )
  );

  const meaning = {
    dir: targetDir,
    file: path.resolve(file).replace(config.rootFolder + "/", ""),
    title,
    wikiSpace,
    wikiTitle,
    wikiSkip: wikiSkip === undefined ? false : wikiSkip === "true",
    content
  };

  return meaning;
}

function write(f) {
  const file = f.file;
  const absoluteFile = config.rootFolder + "/" + file;
  const git = config.gitBaseUrl ? config.gitBaseUrl + ("tree/master/" + file) : undefined;
  const target = path.resolve(f.dir + "/" + file);

  let md = f.content;
  md = f.content.replace("# " + f.title + "\n", "\n");
  if (git) {
  md =
    "\nAutogenerated from " +
    (git.endsWith("/README.md") ? git.replace("/README.md", "") : git) +
    "\n" +
    md;
  }

  if (!f.wikiTitle) {
    md = "<!-- Title: " + f.title + " -->\n" + md;
  }

  // Check upper levels of hierarchy if there is readme and its deeper than root
  if (path.resolve(path.dirname(absoluteFile)) != config.rootFolder) {
    let parentPath = path.resolve(path.dirname(path.dirname(absoluteFile)));
    while (parentPath != config.rootFolder) {
      const parentReadme = path.resolve(parentPath, "README.md");
      if (fs.existsSync(parentReadme)) {
        console.info("Parent: " + parentReadme);
        // Get its title and add to md Parent:
        const tokens = marked.lexer(
          fs.readFileSync(parentReadme, { encoding: "utf-8" }),
          {}
        );
        const parentTitle = R.head(
          tokens.filter(t => t.type === "heading" && t.depth === 1)
        );
        if (parentTitle !== undefined) {
          md = "<!-- Parent: " + parentTitle.text + " -->\n" + md;
        }
      }
      parentPath = path.dirname(parentPath);
    }
  }

  if (f.parent) {
    md = "<!-- Parent: " + f.parent + " -->\n" + md;
  }

  if (!f.wikiSpace) {
    md = "<!-- Space: " + config.confluenceSpaceId + " -->\n" + md;
  }

  if (f.jsdoc) {
    md = md + "\n\n" + f.jsdoc;
  }

  if (!f.wikiSkip) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, md);
  }
}

function produceJsdoc(dir, title) {
  return jsdoc2md
    .render({
      partial: __dirname + "/custom/**/*.hbs",
      helper: __dirname + "/custom/functions.js",
      files: config.rootFolder + "/" + dir + "/**/*.js",
      configure:  __dirname + "/custom/config.json",
    })
    .then(markdown => ({
      dir,
      title,
      markdown
    }))
    .catch(e => {
      console.warn("Failed to process " + dir, e)
    })
}

// FIXME: Ridiculous
xhtmlsafe = markdown => markdown.split("<hr>").join("<hr/>");

function parseMarkdown() {
  Promise.all(config.jsdoc.map(p => produceJsdoc(p.dir, p.title))).then(jsdoc => {
    const foundJsdoc = {};
    jsdoc.filter(file => file != undefined).forEach(file => {
      foundJsdoc[file.dir] = file;
      console.info("Created jsdoc for " + file.dir);
    });

    consumeFiles(
      config.rootFolder,
      (file, root) => {
        if (config.ignoredMarkdownFiles.indexOf(path.basename(file)) >= 0) {
          console.info("Ignoring markdown file: " + file);
        } else {
          const content = meaning(config.output, file);
          console.info(content.file);

          if (path.basename(content.file) == "README.md") {
            const jsdoc = foundJsdoc[path.dirname(content.file)];
            if (jsdoc !== undefined) {
              console.info("Using found jsdoc");
              jsdoc.used = true;
              content.jsdoc = xhtmlsafe(jsdoc.markdown);
            }
          }

          // Root file is a top of the tree
          if (file === "README.md") {
            content.title = config.title;
            content.wikiTitle = config.title;
            write(content);
          } else {
            write(R.assoc("parent", config.title, content));
          }
        }
      },
      f => f.endsWith(".md"),
      d => config.exclude.indexOf(path.basename(d)) <= -1 && d != config.output
    );

    Object.keys(foundJsdoc).forEach(dir => {
      const jsdoc = foundJsdoc[dir];
      if (jsdoc.used === undefined) {
        console.info("Process standalone jsdoc", dir);
        const title =
          jsdoc.title !== undefined
            ? jsdoc.title
            : titleize(path.basename(dir));
        write({
          file: dir + "/README.md",
          dir: config.output,
          title,
          parent: config.title,
          content: xhtmlsafe(jsdoc.markdown)
        });
      }
    });
  });
}

parseMarkdown();
