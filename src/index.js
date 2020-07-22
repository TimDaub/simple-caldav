// @format
const ical = require("ical.js");
const fetch = require("cross-fetch");
const { parseStringPromise } = require("xml2js");

class ParserError extends Error {
  constructor(...params) {
    super(...params);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParserError);
    }

    this.name = "ParserError";
  }
}

class SimpleCalDAV {
  constructor(uri) {
    this.uri = uri;
  }

  async get() {
    const res = await fetch(this.uri, {
      method: "REPORT",
      headers: {
        "Content-Type": "application/xml; charset=utf-8"
      },
      body: `
				<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
					 <d:prop>
						<d:getetag />
						<c:calendar-data />
					</d:prop>
					<c:filter>
						<c:comp-filter name="VCALENDAR" />
					</c:filter>
				</c:calendar-query>`
    });

    const text = await res.text();
    const parsedRes = await parseStringPromise(text);

    let events;
    if (parsedRes && parsedRes.multistatus && parsedRes.multistatus.response) {
      const { response } = parsedRes.multistatus;

      events = response
        .map(item => item.propstat.map(sub => sub.prop[0]["C:calendar-data"]))
        .flat(2);
      return events.map(this._parse);
    } else {
      throw new ParserError("Server response couldn't be parsed");
    }
  }

  _parse(evt) {
    let parsedCal;
    try {
      parsedCal = ICAL.parse(evt);
    } catch (err) {
      if (err && err.name === "ParserError") {
        throw new ParserError(err.message);
        return;
      } else {
        console.warn(err);
      }
    }

    const comp = new ICAL.Component(parsedCal);
    const vevent = comp.getFirstSubcomponent("vevent");
    const parsed = new ICAL.Event(vevent);
    return parsed;
  }

  async _syncETag() {
    const cal = await fetch(this.uri, {
      method: "REPORT",
      headers: {
        "Content-Type": "application/xml; charset=utf-8"
      },
      body: `
				<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
					 <d:prop>
						<d:getetag />
					</d:prop>
					<c:filter>
						<c:comp-filter name="VCALENDAR" />
					</c:filter>
				</c:calendar-query>`
    });

    const text = await cal.text();
  }
}

module.exports = {
  SimpleCalDAV,
  errors: {
    ParserError
  }
};
