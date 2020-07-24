// @format
const ical = require("ical.js");
const fetch = require("cross-fetch");
const xpath = require("xpath");
const dom = require("xmldom").DOMParser;
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");

const prodid = "-//TimDaub//simple-caldav//EN";
const dateTimeFormat = "YMMDDTHHmmss[Z]";

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

  async createEvent(start, end, summary) {
    // NOTE: It's recommended to add a `@host.com` postfix to the uid. Since,
    // however, this lib will be used by a multitude of clients and since other
    // implementations neither add a postfix (e.g. Thunderbird's caldav plugin),
    // we've taken the freedom to leave it out too.
    const uid = uuidv4();

    return await fetch(`${this.uri}/${uid}.ics`, {
      method: "PUT",
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // NOTE: By adding the `If-None-Match` header, we're making sure that
        // we don't accidentially overwrite an already existing component on
        // the server.
        "If-None-Match": "*"
      },
      // NOTE: Formating of BEGIN:VCALENDAR and END:VCALENDAR, needs to stay
      // exactly like this, as the request is whitecase sensitive.
      body: `BEGIN:VCALENDAR
VERSION:2.0
PRODID:${prodid}
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${SimpleCalDAV.formatDateTime(new Date())}
DTSTART:${SimpleCalDAV.formatDateTime(start)}
DTEND:${SimpleCalDAV.formatDateTime(end)}
SUMMARY:${summary}
END:VEVENT
END:VCALENDAR`
    });
  }

  async listEvents() {
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
    const doc = new dom().parseFromString(text);
    const instruction = {
      events: "//*[local-name()='calendar-data']/text()"
    };

    let { events } = SimpleCalDAV.traverseXML(doc, instruction);
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

  static traverseXML(doc, instruction) {
    for (const [key, path] of Object.entries(instruction)) {
      const nodes = xpath.select(path, doc);
      if (!nodes.length) {
        throw new TraversalError(
          `Couldn't find path from instruction: ${path}`
        );
      }
      instruction[key] = nodes.map(n => n.nodeValue);
    }

    return instruction;
  }

  static formatDateTime(dateTime) {
    // NOTE: See https://tools.ietf.org/html/rfc5545 under:
    // "FORM #2: DATE WITH UTC TIME"
    const date = moment(dateTime);
    return date.utc().format(dateTimeFormat);
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
    // NOTE: For some reason, etags currently come with double quotes from the
    // radicale server that we're building against. Since they're sent with
    // double quotes consistently, I've decided to simply leave them in. Mainly,
    // because a tag's change notifies a change in storage. This assumption
    // doesn't change with consistently added double quotes.
    const instruction = {
      href: "//*[local-name()='href']/text()",
      etag: "//*[local-name()='getetag']/text()"
    };
    const doc = new dom().parseFromString(text);
    const etags = SimpleCalDAV.traverseXML(doc, instruction);
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
