// @format
const test = require("ava");
const createWorker = require("expressively-mocked-fetch");
const dom = require("xmldom").DOMParser;
const moment = require("moment");

const {
  SimpleCalDAV,
  errors: { ParserError, ServerError }
} = require("../src/index.js");

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
  t.assert("ServerError" in libObj.errors);
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
      await dav.listEvents();
    },
    { instanceOf: ParserError }
  );
});

test("fetching ics-incompatible response", async t => {
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
  const events = await dav.listEvents();
  t.assert(events.length === 0);
});

test("fetching calendar single event without an alarm", async t => {
  const summary = "Work on this lib";
  const action = "EMAIL";
  const attendee = "attendee";
  const description = "description";
  const time = "20200729T130856Z";
  const subject = "bla";
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
  const events = await dav.listEvents();
  t.assert(events.length === 1);
  t.assert(events[0].summary === summary);
  t.assert(events[0].start instanceof Date);
  t.assert(events[0].end instanceof Date);
  t.assert(events[0].alarms.length === 0);
});

test("fetching calendar single event with a relative alarm trigger", async t => {
  const summary = "Work on this lib";
  const action = "EMAIL";
  const attendee = "attendee";
  const description = "description";
  const time = "20200729T130856Z";
  const subject = "bla";
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
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Mozilla Standardbeschreibung
TRIGGER:-PT15M
END:VALARM
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
  const events = await dav.listEvents();
  t.assert(events.length === 1);
  t.assert(events[0].summary === summary);
  t.assert(events[0].start instanceof Date);
  t.assert(events[0].end instanceof Date);
  t.assert(events[0].alarms.length === 0);
});

test("fetching calendar single event", async t => {
  const summary = "Work on this lib";
  const action = "EMAIL";
  const attendee = "attendee";
  const description = "description";
  const time = "20200729T130856Z";
  const subject = "bla";
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
BEGIN:VALARM
ACTION:${action}
ATTENDEE:${attendee}
DESCRIPTION:${description}
TRIGGER;VALUE=DATE-TIME:${time}
END:VALARM
BEGIN:VALARM
ACTION:EMAIL
ATTENDEE:mailto:me@example.com
SUBJECT:${subject}
DESCRIPTION:A email body
TRIGGER;VALUE=DATE-TIME:20200729T140856Z
END:VALARM
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
  const events = await dav.listEvents();
  t.assert(events.length === 1);
  t.assert(events[0].summary === summary);
  t.assert(events[0].start instanceof Date);
  t.assert(events[0].end instanceof Date);
  t.assert(events[0].alarms.length === 2);
  t.assert(events[0].alarms[0].action === action);
  t.assert(events[0].alarms[0].attendee === attendee);
  t.assert(events[0].alarms[0].trigger instanceof Date);

  t.assert(events[0].alarms[1].subject === subject);
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
  const events = await dav.listEvents();
  t.assert(events.length === 2);
  t.assert(events[0].summary === summary);
  t.assert(events[0].start instanceof Date);
  t.assert(events[0].end instanceof Date);
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
  const doc = new dom().parseFromString(s, "text/xml");

  const instruction = {
    href: "//*[local-name()='href']/text()",
    etag: "//*[local-name(.)='getetag']/text()",
    abc: "//*[local-name(.)='abc']/text()"
  };
  const content = SimpleCalDAV.traverseXML(doc, instruction);
  t.assert("href" in content && "etag" in content && "abc" in content);
  t.assert(content.abc.length === 2);
  t.assert(content.abc[0] === expected);
  t.assert(content.abc[1] === expected2);
});

test.skip("traversing a correct XML tree where values are missing", async t => {
  const s = `<?xml version="1.0" encoding="UTF-8"?>
    <res>
      <key2>value2</key2>
      <status>missing</status>
    </res>
    <res>
      <key1>value1</key1>
      <key2>value2</key2>
    </res>
  `;
  const doc = new dom().parseFromString(s, "text/xml");

  const instruction = {
    key1: "//*[local-name()='key1']/text()",
    key2: "//*[local-name(.)='key2']/text()"
  };
  const content = SimpleCalDAV.traverseXML(doc, instruction);
  console.log(content);
  t.assert(content.key1[0] === null);
  t.assert(content.key1[1] === "value1");
  t.assert(content.key2[0] === "value1");
  t.assert(content.key2[1] === "value2");
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

test("formatting a date to iCal compliant date time", t => {
  // NOTE: For reference, see https://tools.ietf.org/html/rfc5545 under:
  // "FORM #2: DATE WITH UTC TIME"
  const formatted = SimpleCalDAV.formatDateTime(new Date());
  const format = new RegExp(
    "[0-9]{4}[0-1][0-9][0-3][0-9]T[0-2][0-9][0-6][0-9]\\d{2}Z"
  );
  // Tested with: 19980119T070000Z
  t.assert(format.test(formatted));
});

test("creating an event", async t => {
  const worker = await createWorker(`
    app.put('/:resource', function (req, res) {
      res.status(201).send();
    });
  `);
  const URI = `http://localhost:${worker.port}`;

  const dav = new SimpleCalDAV(URI);
  const start = moment().format();
  const end = moment()
    .add(1, "hour")
    .format();
  const res = await dav.createEvent(start, end, "test summary");
  t.assert(res.status === 201);
});

test("updating an event completely", async t => {
  const uid = "445ecbbc-acca-4ebb-b733-5c03477d048a";
  const worker = await createWorker(`
    app.put('/${uid}.ics', function (req, res) {
      res.status(201).send();
    });
  `);
  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  const start = moment().format();
  const end = moment()
    .add(1, "hour")
    .format();
  const res = await dav.updateEvent(uid, start, end, "updated summary");
  t.assert(res.status === 201);
});

test("transforming an event without alarms to a VEVENT", t => {
  const evt = {
    start: new Date(),
    end: new Date(),
    summary: "abc",
    uid: "uid"
  };
  const vevent = SimpleCalDAV.toVEVENT(evt);
  t.assert(new RegExp("UID:uid").test(vevent));
  t.assert(new RegExp("SUMMARY:abc").test(vevent));
  t.assert(new RegExp("DTSTART:\\d{8}T\\d{6}Z").test(vevent));
  t.assert(new RegExp("DTEND:\\d{8}T\\d{6}Z").test(vevent));
  t.assert(new RegExp("DTSTAMP:\\d{8}T\\d{6}Z").test(vevent));
});

test("transforming an email alarm into a VALARM", t => {
  const alarm = {
    action: "email",
    summary: "Email's subject",
    description: "email's description",
    trigger: new Date(),
    attendee: "email@example.com"
  };

  const valarm = SimpleCalDAV.toVALARM(alarm);
  t.assert(new RegExp("ACTION:EMAIL").test(valarm));
  t.assert(new RegExp(`SUMMARY:${alarm.summary}`).test(valarm));
  t.assert(new RegExp(`DESCRIPTION:${alarm.description}`).test(valarm));
  t.assert(new RegExp("TRIGGER:\\d{8}T\\d{6}Z").test(valarm));
  t.assert(new RegExp(`ATTENDEE:mailto:${alarm.attendee}`).test(valarm));
});

test("transforming an sms alarm into a VALARM", t => {
  const alarm = {
    action: "sms",
    description: "sms's description",
    trigger: new Date(),
    attendee: "0123456789"
  };

  const valarm = SimpleCalDAV.toVALARM(alarm);
  t.assert(new RegExp("ACTION:SMS").test(valarm));
  t.assert(new RegExp(`DESCRIPTION:${alarm.description}`).test(valarm));
  t.assert(new RegExp("TRIGGER:\\d{8}T\\d{6}Z").test(valarm));
  t.assert(new RegExp(`ATTENDEE:sms:${alarm.attendee}`).test(valarm));
});

test("getting sync token", async t => {
  const syncToken = "abc";
  const displayName = "displayname";
  const worker = await createWorker(`
    app.propfind('/', function (req, res) {
      res.status(201).send(\`<?xml version='1.0' encoding='utf-8'?>
<multistatus xmlns="DAV:" xmlns:CS="http://calendarserver.org/ns/">
  <response>
    <href>/radicale/example%40gmail.com/8409b6d2-8dcc-997b-45d6-517801237d38/</href>
    <propstat>
      <prop>
        <displayname>${displayName}</displayname>
        <CS:getctag>"09aad437ed2e4b4cd8d700ad410385d9b13e9fd964862d7f2987e4c844237465"</CS:getctag>
        <sync-token>${syncToken}</sync-token>
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
  const token = await dav.getSyncToken();
  t.assert(token.syncToken === syncToken);
  t.assert(token.displayName === displayName);
});

test("getting collection with a sync token", async t => {
  const href = "https://example.com";
  const etag = "etag";
  const status = "HTTP/1.1 200";
  const syncToken1 = "1";
  const syncToken2 = "2";

  // TODO: Also implement test for 404 asset
  const worker = await createWorker(
    `
    let counter = 0;
    app.report('/', function (req, res) {
      if (counter === 0) {
        res.status(201).send(\`<?xml version='1.0' encoding='utf-8'?>
<multistatus xmlns="DAV:">
  <sync-token>${syncToken1}</sync-token>
  <response>
    <href>${href}</href>
    <propstat>
      <prop>
        <getetag>${etag}</getetag>
      </prop>
      <status>${status}</status>
    </propstat>
  </response>
</multistatus>
        \`);
      } else if (counter === 1) {
        res.status(201).send(\`<?xml version='1.0' encoding='utf-8'?>
<multistatus xmlns="DAV:">
  <sync-token>${syncToken2}</sync-token>
</multistatus>
        \`);
      }
      counter++;
    });
  `,
    2
  );
  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  const col = await dav.syncCollection();
  t.assert(col.syncToken === syncToken1);
  t.assert(col.collection.length === 1);
  t.assert(col.collection[0].href === href);
  t.assert(col.collection[0].etag === etag);
  t.assert(col.collection[0].statusCode === 200);
  const emptyCol = await dav.syncCollection(col.syncToken);
  t.assert(emptyCol.syncToken === syncToken2);
  t.assert(emptyCol.collection.length === 0);
});

test("getting a single event", async t => {
  const action = "EMAIL";
  const attendee = "attendee";
  const description = "description";
  const time = "20200729T130856Z";
  const subject = "bla";
  const worker = await createWorker(`
    app.get('/:uid', function (req, res) {
      res.status(201).send(\`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TimDaub//simple-caldav//EN
BEGIN:VEVENT
UID:6720d455-76aa-4740-8766-c064df95bb3b
DTSTART:20200729T180000Z
DTEND:20200729T183000Z
DTSTAMP:20200729T130856Z
SUMMARY:new one
BEGIN:VALARM
ACTION:${action}
ATTENDEE:${attendee}
DESCRIPTION:${description}
TRIGGER;VALUE=DATE-TIME:${time}
END:VALARM
BEGIN:VALARM
ACTION:EMAIL
ATTENDEE:mailto:me@example.com
SUBJECT:${subject}
DESCRIPTION:A email body
TRIGGER;VALUE=DATE-TIME:20200729T140856Z
END:VALARM
END:VEVENT
END:VCALENDAR\`);
    });
  `);
  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  const evt = await dav.getEvent("abc");
  t.assert("summary" in evt);
  t.assert("start" in evt);
  t.assert("end" in evt);
  t.assert("alarms" in evt);
  t.assert(evt.alarms.length === 2);
  t.assert(evt.alarms[0].action === action);
  t.assert(evt.alarms[0].attendee === attendee);
  t.assert(evt.alarms[0].trigger instanceof Date);

  t.assert(evt.alarms[1].subject === subject);
});

test("if syncCollection returns collection with correctly ordered properties", async t => {
  const href = "1";
  const href2 = "2";
  const etag = "etag";
  const worker = await createWorker(
    `
    app.report('/', function (req, res) {
      res.status(201).send(\`<?xml version='1.0' encoding='utf-8'?>
<multistatus xmlns="DAV:">
  <sync-token>1</sync-token>
  <response>
    <href>${href}</href>
    <propstat>
      <status>HTTP/1.1 404 Not Found</status>
    </propstat>
  </response>
  <response>
    <href>${href2}</href>
    <propstat>
      <prop>
        <getetag>${etag}</getetag>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>\`);
    });
  `
  );
  const URI = `http://localhost:${worker.port}`;
  const dav = new SimpleCalDAV(URI);
  const col = await dav.syncCollection();
  t.assert(col.collection[0].statusCode === 404);
  t.assert(col.collection[0].href === href);
  t.assert(!col.collection[0].etag);
  t.assert(col.collection[1].statusCode === 200);
  t.assert(col.collection[1].href === href2);
  t.assert(col.collection[1].etag === etag);
});
