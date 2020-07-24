const {
  SimpleCalDAV,
  errors: { ParserError, TraversalError }
} = require("../src/index.js");

const URI = process.env.HOST;

async function run() {
  const dav = new SimpleCalDAV(URI);
  const etags = await dav.getETags();
  console.log(etags);
}

run();

