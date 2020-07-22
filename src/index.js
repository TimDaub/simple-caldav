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

class TraversalError extends Error {
  constructor(...params) {
    super(...params);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TraversalError);
    }

    this.name = "TraversalError";
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
      // TODO: At one point, we could start templating this...
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
    const xml = await parseStringPromise(text);

    let events = SimpleCalDAV.traverseXML(xml, "C:calendar-data");
    return events.map(this.parseICS);
  }

  parseICS(evt) {
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

  static traverseXML(xml, identifier) {
    if (xml && xml.multistatus && xml.multistatus.response) {
      let content = xml.multistatus.response;

      content = content
        .map(item => item.propstat.map(sub => sub.prop[0][identifier]))
        .flat(2);
      return content;
    } else {
      throw new TraversalError("Unexpected XML structure discovered.");
    }
  }

  async getETags() {
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
    const xml = await parseStringPromise(text);
    // NOTE: For some reason, etags currently come with double quotes from the
    // radicale server that we're building against. Since they're sent with
    // double quotes consistently, I've decided to simply leave them in. Mainly,
    // because a tag's change notifies a change in storage. This assumption
    // doesn't change with consistently added double quotes.
    const etags = SimpleCalDAV.traverseXML(xml, "getetag");
    return etags;
  }
}

module.exports = {
  SimpleCalDAV,
  errors: {
    ParserError,
    TraversalError
  }
};
