// @format
const ical = require("ical.js");
const fetch = require("cross-fetch");
const xpath = require("xpath");
const dom = require("xmldom").DOMParser;
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");
// NOTE: We decided on using sha1 for generating etags, as there's no mutual
// crypto API for simple-caldav's targets, which are nodejs and browser
// environments.
const sha1 = require("sha1");

const prodid = "-//TimDaub//simple-caldav//EN";
const dateTimeFormat = "YMMDDTHHmmss[Z]";

class ServerError extends Error {
  constructor(...params) {
    super(...params);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServerError);
    }

    this.name = "ServerError";
  }
}

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

  async createEvent(start, end, summary, alarms) {
    return this.handleEvent(start, end, summary, alarms, "create");
  }

  // TODO: Do we want to make this method more convenient by allowing partial
  // updates?
  async updateEvent(uid, start, end, summary, alarms) {
    return this.handleEvent(start, end, summary, alarms, "update", uid);
  }

  static toVALARM(alarm) {
    let attendee;
    if (alarm && alarm.attendee && alarm.action.toUpperCase() === "EMAIL") {
      attendee = `mailto:${alarm.attendee}`;
    } else if (
      alarm &&
      alarm.attendee &&
      alarm.action.toUpperCase() === "SMS"
    ) {
      attendee = `sms:${alarm.attendee}`;
    } else {
      throw new Error(
        `Action can only be of type EMAIL or SMS: ${alarm.action}`
      );
    }

    let valarm = "BEGIN:VALARM\n";
    valarm += `ACTION:${alarm.action.toUpperCase()}\n`;
    if (alarm && alarm.summary) {
      valarm += `SUMMARY:${alarm.summary}\n`;
    }
    valarm += `ATTENDEE:${attendee}\n`;
    valarm += `DESCRIPTION:${alarm.description}\n`;
    valarm += `TRIGGER:${SimpleCalDAV.formatDateTime(alarm.trigger)}\n`;
    valarm += `END:VALARM\n`;

    return valarm;
  }

  static toVEVENT(evt, alarms) {
    if ("uid" in evt && "start" in evt && "end" in evt && "summary" in evt) {
      let vevent = "BEGIN:VCALENDAR\n";
      vevent += `VERSION:2.0\n`;
      vevent += `PRODID:${prodid}\n`;
      vevent += "BEGIN:VEVENT\n";
      vevent += `UID:${evt.uid}\n`;
      vevent += `DTSTAMP:${SimpleCalDAV.formatDateTime(new Date())}\n`;
      vevent += `DTSTART:${SimpleCalDAV.formatDateTime(evt.start)}\n`;
      vevent += `DTEND:${SimpleCalDAV.formatDateTime(evt.end)}\n`;
      vevent += `SUMMARY:${evt.summary}\n`;
      if (alarms) {
        vevent += alarms;
      }
      vevent += "END:VEVENT\n";
      vevent += "END:VCALENDAR";
      return vevent;
    } else {
      throw new Error("Mandatory keys in event missing");
    }
  }

  async handleEvent(start, end, summary, alarms, method, uid = "") {
    if (!uid) {
      // NOTE: It's recommended to add a `@host.com` postfix to the uid. Since,
      // however, this lib will be used by a multitude of clients and since other
      // implementations neither add a postfix (e.g. Thunderbird's caldav plugin),
      // we've taken the freedom to leave it out too.
      uid = uuidv4();
    }
    if (alarms) {
      alarms = alarms.map(SimpleCalDAV.toVALARM);
    }

    const body = SimpleCalDAV.toVEVENT({ start, end, summary, uid }, alarms);

    let headers = {
      "Content-Type": "text/calendar; charset=utf-8"
    };

    if (method === "create") {
      headers = { ...headers, ...{ "If-None-Match": "*" } };
    } else if (method === "update") {
      // TODO: Does it make sense to use Etags here?
      // noop
    } else {
      throw new InternalError(`method "${method}" not implemented`);
    }

    return await fetch(`${this.uri}/${uid}.ics`, {
      method: "PUT",
      headers,
      body
    });
  }

  async listEvents(transform = SimpleCalDAV.simplifyEvents) {
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
    if (events.length === 0) {
      return [];
    } else {
      return transform(events.map(SimpleCalDAV.parseICS));
    }
  }

  static parseICS(evt) {
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

  static genETag(s) {
    return sha1(s);
  }

  static simplifyEvents(events) {
    return events.map(evt => ({
      summary: evt.summary,
      start: evt.startDate.toJSDate(),
      end: evt.endDate.toJSDate()
    }));
  }

  static traverseXML(doc, instruction) {
    for (const [key, path] of Object.entries(instruction)) {
      const nodes = xpath.select(path, doc);
      if (!nodes.length) {
        instruction[key] = [];
        console.warn(`Couldn't find path from instruction: ${path}`);
      } else {
        instruction[key] = nodes.map(n => n.nodeValue);
      }
    }

    return instruction;
  }

  static formatDateTime(dateTime) {
    // NOTE: See https://tools.ietf.org/html/rfc5545 under:
    // "FORM #2: DATE WITH UTC TIME"
    const date = moment(dateTime);
    return date.utc().format(dateTimeFormat);
  }

  async getSyncToken() {
    const res = await fetch(this.uri, {
      method: "PROPFIND",
      headers: {
        Depth: 0,
        "Content-Type": "application/xml; charset=utf-8"
      },
      body: `
        <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
          <d:prop>
            <d:displayname />
            <cs:getctag />
            <d:sync-token />
          </d:prop>
        </d:propfind>
      `
    });
    const text = await res.text();

    const instruction = {
      syncToken: "//*[local-name()='sync-token']/text()",
      displayName: "//*[local-name()='displayname']/text()"
    };
    const doc = new dom().parseFromString(text);
    const tokens = SimpleCalDAV.traverseXML(doc, instruction);

    // NOTE: For radicale, each calendar has its own resource URI. This means
    // requesting the sync token will never yield more than one display name or
    // syncToken.
    return {
      syncToken: tokens.syncToken[0],
      displayName: tokens.displayName[0]
    };
  }

  async syncCollection(syncToken) {
    let body;
    if (syncToken) {
      body = `<?xml version="1.0" encoding="utf-8" ?>
<d:sync-collection xmlns:d="DAV:">
  <d:sync-token>${syncToken}</d:sync-token>
  <d:sync-level>1</d:sync-level>
  <d:prop>
    <d:getetag/>
  </d:prop>
</d:sync-collection>`;
    } else {
      body = `<?xml version="1.0" encoding="utf-8" ?>
<d:sync-collection xmlns:d="DAV:">
  <d:sync-token/>
  <d:sync-level>1</d:sync-level>
  <d:prop>
    <d:getetag/>
  </d:prop>
</d:sync-collection>
      `;
    }
    const res = await fetch(this.uri, {
      method: "REPORT",
      headers: {
        "Content-Type": "application/xml; charset=utf-8"
      },
      body
    });

    const text = await res.text();
    const instruction = {
      syncToken: "//*[local-name()='sync-token']/text()",
      href: "//*[local-name()='href']/text()",
      etag: "//*[local-name()='getetag']/text()",
      status: "//*[local-name()='status']/text()"
    };
    const doc = new dom().parseFromString(text);
    const values = SimpleCalDAV.traverseXML(doc, instruction);

    let collection = [];
    for (let i = 0; i < values.href.length; i++) {
      let [_, statusCode] = values.status[i].match(
        new RegExp("HTTP\\/1\\.1 (\\d{3})")
      );
      statusCode = parseInt(statusCode, 10);

      let resource = {
        href: values.href[i],
        statusCode
      };
      if (statusCode === 200 && values.etag[i]) {
        resource.etag = values.etag[i];
      }

      collection.push(resource);
    }
    return {
      syncToken: values.syncToken[0],
      collection
    };
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

    if (cal.status >= 500) {
      throw new ServerError(`The server wasn't able to handle the request.`);
    }

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
    ServerError
  }
};
