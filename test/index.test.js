// @format
const test = require("ava");
const createWorker = require("expressively-mocked-fetch");
const dom = require('xmldom').DOMParser;

const {
  SimpleCalDAV,
  errors: { ParserError, TraversalError }
} = require("../src/index.js");

const PORT = 3000;

test("if parameters are correctly stored", t => {
  const URI = "https://example.com";
  const dav = new SimpleCalDAV(URI);

  t.assert(dav.uri === URI);
});

test("if objects are correctly exported", t => {
  const libObj = require("../src/index.js");

  t.assert("errors" in libObj);
  t.assert("SimpleCalDAV" in libObj);
  t.assert("ParserError" in libObj.errors);
  t.assert("TraversalError" in libObj.errors);
});

test("test fetching empty calendar", async t => {
  const worker = await createWorker(`
    app.report('/', function (req, res) {
      res.send(\`
<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
   <response>
      <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/50113370-f61f-4444-9e94-e3ba1d2467b8.ics</href>
      <propstat>
         <prop>
            <getetag>"aa98130e9fac911f70a73dac8b57e58a482b04ec4b8a5417dfedf8f42069c6d0"</getetag>
            <C:calendar-data>
              BEGIN:VCALENDAR
              VERSION:2.0
              PRODID: blaaa
              END:VCALENDAR
						</C:calendar-data>
         </prop>
         <status>HTTP/1.1 200 OK</status>
      </propstat>
   </response>
</multistatus>
      \`);
    });
  `);

  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  await t.throwsAsync(
    async () => {
      await dav.get();
    },
    { instanceOf: ParserError }
  );
});

test("fetching no ics compatible response", async t => {
  const worker = await createWorker(`
    app.report('/', function (req, res) {
      res.send(\`
        <xml>
          hello world
        </xml>
      \`);
    });
  `);

  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  await t.throwsAsync(
    async () => {
      await dav.get();
    },
    { instanceOf: TraversalError }
  );
});

test("fetching calendar single event", async t => {
  const summary = "Work on this lib";
  const worker = await createWorker(`
    app.report('/', function (req, res) {
      res.send(\`
<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
   <response>
      <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/50113370-f61f-4444-9e94-e3ba1d2467b8.ics</href>
      <propstat>
         <prop>
            <getetag>"aa98130e9fac911f70a73dac8b57e58a482b04ec4b8a5417dfedf8f42069c6d0"</getetag>
            <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN
BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10
TZNAME:CET
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3
TZNAME:CEST
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:50113370-f61f-4444-9e94-e3ba1d2467b8
DTSTART;TZID=Europe/Berlin:20200717T100000
DTEND;TZID=Europe/Berlin:20200717T133000
CREATED:20200717T143449Z
DTSTAMP:20200717T143454Z
LAST-MODIFIED:20200717T143454Z
SUMMARY:${summary}
TRANSP:OPAQUE
X-MOZ-GENERATION:1
END:VEVENT
END:VCALENDAR</C:calendar-data>
         </prop>
         <status>HTTP/1.1 200 OK</status>
      </propstat>
   </response>
</multistatus>
      \`); 
    });
  `);

  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  const events = await dav.get();
  t.assert(events.length === 1);
});

test("fetching calendar with multiple events", async t => {
  const summary = "Work on this lib";

  const worker = await createWorker(`
    app.report('/', function (req, res) {
      res.send(\`
<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
   <response>
      <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/50113370-f61f-4444-9e94-e3ba1d2467b8.ics</href>
      <propstat>
         <prop>
            <getetag>"aa98130e9fac911f70a73dac8b57e58a482b04ec4b8a5417dfedf8f42069c6d0"</getetag>
            <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN
BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10
TZNAME:CET
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3
TZNAME:CEST
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:50113370-f61f-4444-9e94-e3ba1d2467b8
DTSTART;TZID=Europe/Berlin:20200717T100000
DTEND;TZID=Europe/Berlin:20200717T133000
CREATED:20200717T143449Z
DTSTAMP:20200717T143454Z
LAST-MODIFIED:20200717T143454Z
SUMMARY:${summary}
TRANSP:OPAQUE
X-MOZ-GENERATION:1
END:VEVENT
END:VCALENDAR</C:calendar-data>
         </prop>
         <status>HTTP/1.1 200 OK</status>
      </propstat>
   </response>
   <response>
      <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/105b112e-7d65-3147-a182-deaf17d08a12.ics</href>
      <propstat>
         <prop>
            <getetag>"86b95c0081a021570746219276242ba6fb5b59632260d3ef1740d37c2ce806f2"</getetag>
            <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN
BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10
TZNAME:CET
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3
TZNAME:CEST
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:105b112e-7d65-3147-a182-deaf17d08a12
DTSTART;TZID=Europe/Berlin:20200718T094500
DTEND;TZID=Europe/Berlin:20200718T131500
CREATED:20200717T143444Z
DTSTAMP:20200717T143446Z
LAST-MODIFIED:20200717T143446Z
SUMMARY:Biketour
TRANSP:OPAQUE
X-MOZ-GENERATION:1
END:VEVENT
END:VCALENDAR</C:calendar-data>
         </prop>
         <status>HTTP/1.1 200 OK</status>
      </propstat>
   </response>
</multistatus>
      \`); 
    });
  `);

  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  const events = await dav.get();
  t.assert(events.length === 2);
  t.assert(events[0].summary === summary);
});

test("traversing a correct XML tree", async t => {
  const expected = "def";
  const expected2 = "lel";
  const s = `<?xml version="1.0" encoding="UTF-8"?>
  <multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
     <response>
        <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/50113370-f61f-4444-9e94-e3ba1d2467b8.ics</href>
        <propstat>
           <prop>
              <getetag>"aa98130e9fac911f70a73dac8b57e58a482b04ec4b8a5417dfedf8f42069c6d0"</getetag>
							<abc>${expected}</abc>
           </prop>
           <status>HTTP/1.1 200 OK</status>
        </propstat>
     </response>
     <response>
        <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/50113370-f61f-4444-9e94-e3ba1d2467b8.ics</href>
        <propstat>
           <prop>
              <getetag>"aa98130e9fac911f70a73dac8b57e58a482b04ec4b8a5417dfedf8f42069c6d0"</getetag>
							<abc>${expected2}</abc>
           </prop>
           <status>HTTP/1.1 200 OK</status>
        </propstat>
     </response>
  </multistatus>
  `;
  const doc = new dom().parseFromString(s, "text/xml")

  const instruction = {
    "href": "//*[local-name()='href']/text()",
    "etag": "//*[local-name(.)='getetag']/text()",
    "abc": "//*[local-name(.)='abc']/text()",
  }
  const content = SimpleCalDAV.traverseXML(doc, instruction);
  t.assert("href" in content && "etag" in content && "abc" in content);
  t.assert(content.abc.length === 2);
  t.assert(content.abc[0] === expected);
  t.assert(content.abc[1] === expected2);
});

test("traversing an incorrect XML tree", async t => {
  const expected = "def";
  const expected2 = "lel";
  const s = `<?xml version="1.0" encoding="UTF-8"?>
	<incorrect>
	</incorrect>
  `;
  const doc = new dom().parseFromString(s)

  t.throws(
    () => {
      SimpleCalDAV.traverseXML(doc, {"test": "123"});
    },
    { instanceOf: TraversalError }
  );
});

test("synching etag", async t => {
  const etag1 = "etag1";
  const etag2 = "etag2";
  const worker = await createWorker(`
    app.report('/', function (req, res) {
      res.send(\`<?xml version="1.0" encoding="UTF-8"?>
        <multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
           <response>
              <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/50113370-f61f-4444-9e94-e3ba1d2467b8.ics</href>
              <propstat>
                 <prop>
                    <getetag>${etag1}</getetag>
                 </prop>
                 <status>HTTP/1.1 200 OK</status>
              </propstat>
           </response>
           <response>
              <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/50113370-f61f-4444-9e94-e3ba1d2467b8.ics</href>
              <propstat>
                 <prop>
                    <getetag>${etag2}</getetag>
                 </prop>
                 <status>HTTP/1.1 200 OK</status>
              </propstat>
           </response>
        </multistatus>
      \`);
    });
  `);

  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  const etags = await dav.getETags();
  t.assert("href" in etags && "etag" in etags);
  t.assert(etags.href.length == 2);
  t.assert(etags.etag.length == 2);
});
