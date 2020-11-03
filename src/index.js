// @format
const ical = require("ical.js");
const fetch = require("cross-fetch");
const { select } = require("xpath");
const dom = require("xmldom").DOMParser;
const { v4: uuidv4 } = require("uuid");
const { format, utcToZonedTime } = require("date-fns-tz");
// NOTE: We decided on using sha1 for generating etags, as there's no mutual
// crypto API for simple-caldav's targets, which are nodejs and browser
// environments.
const sha1 = require("sha1");

const prodid = "-//TimDaub//simple-caldav//EN";
// NOTE: https://tools.ietf.org/html/rfc5545#section-3.8.1.11
const allowedVEVENTStatus = ["TENTATIVE", "CONFIRMED", "CANCELED"];

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

  async createEvent(
    start,
    end,
    summary,
    alarms,
    _status,
    organizer,
    _location
  ) {
    return this.handleEvent(
      start,
      end,
      summary,
      alarms,
      _status,
      organizer,
      _location,
      "create"
    );
  }

  // TODO: Do we want to make this method more convenient by allowing partial
  // updates?
  async updateEvent(
    uid,
    start,
    end,
    summary,
    alarms,
    _status,
    organizer,
    _location
  ) {
    return this.handleEvent(
      start,
      end,
      summary,
      alarms,
      _status,
      organizer,
      _location,
      "update",
      uid
    );
  }

  static extractUid(href) {
    const [_, uid] = href.match(new RegExp("([^\\/]+)\\.ics"));
    return uid;
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
    valarm += `TRIGGER;VALUE=DATE-TIME:${SimpleCalDAV.formatDateTime(
      alarm.trigger
    )}\n`;
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
      if (evt._status) {
        if (allowedVEVENTStatus.includes(evt._status)) {
          vevent += `STATUS:${evt._status}\n`;
        } else {
          throw new ParserError(
            `Your status "${evt._status}" is not an allowed status for a VEVENT`
          );
        }
      }
      if (evt.organizer && evt.organizer.email) {
        if (evt.organizer.commonName) {
          vevent += `ORGANIZER;CN=${evt.organizer.commonName}:mailto:${
            evt.organizer.email
          }\n`;
        } else {
          vevent += `ORGANIZER:mailto:${evt.organizer.email}\n`;
        }
      }
      if (evt._location) {
        vevent += `LOCATION:${evt._location}\n`;
      }
      vevent += "END:VEVENT\n";
      vevent += "END:VCALENDAR";
      return vevent;
    } else {
      throw new ParserError("Mandatory keys in event missing");
    }
  }

  async handleEvent(
    start,
    end,
    summary,
    alarms,
    _status,
    organizer,
    _location,
    method,
    uid = ""
  ) {
    if (!uid) {
      // NOTE: It's recommended to add a `@host.com` postfix to the uid. Since,
      // however, this lib will be used by a multitude of clients and since other
      // implementations neither add a postfix (e.g. Thunderbird's caldav plugin),
      // we've taken the freedom to leave it out too.
      uid = uuidv4();
    }
    if (alarms) {
      alarms = alarms.map(SimpleCalDAV.toVALARM).join("");
    }

    const body = SimpleCalDAV.toVEVENT(
      { start, end, summary, uid, _status, organizer, _location },
      alarms
    );

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

  async getEvent(uid, transform = SimpleCalDAV.simplifyEvent) {
    const href = `${this.uri}/${uid}.ics`;
    const res = await fetch(href, {
      method: "GET",
      headers: {
        "Content-Type": "application/xml; charset=utf-8"
      }
    });
    let evt = await res.text();
    evt = SimpleCalDAV.parseICS(evt);
    return transform(evt, href);
  }

  async listEvents(transform = SimpleCalDAV.simplifyEvent) {
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
      events: "//*[local-name()='calendar-data']/text()",
      hrefs: "//*[local-name()='href']/text()"
    };

    let { events, hrefs } = SimpleCalDAV.traverseXML(doc, instruction);
    if (events.length === 0) {
      return [];
    } else {
      for (let i = 0; i < events.length; i++) {
        let evt = events[i];
        const href = this.uri + hrefs[i];

        evt = SimpleCalDAV.parseICS(evt);
        evt = transform(evt, href);
        events[i] = evt;
      }

      return events;
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
        throw err;
      }
    }

    const comp = new ICAL.Component(parsedCal);
    const vevent = comp.getFirstSubcomponent("vevent");
    return vevent;
  }

  static genETag(s) {
    return sha1(s);
  }

  static simplifyEvent(evt, href) {
    let palarms = [];
    let finalEvent = { href };

    let valarms = evt.getAllSubcomponents("valarm");
    valarms = valarms
      .map(alarm => {
        let trigger;
        try {
          trigger = alarm.getFirstPropertyValue("trigger").toJSDate();
        } catch (err) {
          if (err instanceof TypeError) {
            console.warn("Skipping VALARM because TRIGGER not parseable");
            // NOTE: ical.js cannot parse relative at the moment: https://github.com/mozilla-comm/ical.js/issues/451
            return;
          } else {
            console.log(err);
          }
        }

        const action = alarm.getFirstPropertyValue("action");
        const attendee = alarm.getFirstPropertyValue("attendee");
        let res = {
          action,
          trigger,
          description: alarm.getFirstPropertyValue("description"),
          subject: alarm.getFirstPropertyValue("subject")
        };

        const mailtoExpr = new RegExp(".*mailto:(.+)$", "i");
        const smsExpr = new RegExp(".*sms:(.+)$", "i");
        if (action === "EMAIL" && mailtoExpr.test(attendee)) {
          const [_, email] = attendee.match(mailtoExpr);
          res.attendee = email;
        } else if (action === "SMS" && smsExpr.test(attendee)) {
          const [_, phone] = attendee.match(smsExpr);
          res.attendee = phone;
        }

        return res;
      })
      .filter(alarm => !!alarm);
    finalEvent.alarms = valarms;

    const pevent = new ICAL.Event(evt);
    finalEvent.summary = pevent.summary;
    finalEvent.location = pevent._firstProp("location");
    finalEvent.start = pevent.startDate.toJSDate();
    finalEvent.end = pevent.endDate.toJSDate();

    const orgProp = evt.getFirstProperty("organizer");
    let email, commonName;
    if (orgProp) {
      const orgMail = orgProp.getFirstValue("organizer");
      email = orgMail.match(new RegExp("mailto:(.*)", "i"))[1];
      commonName = orgProp.getParameter("cn");
    }

    if (email) {
      finalEvent.organizer = { email };
    }
    if (email && commonName) {
      finalEvent.organizer = { email, commonName };
    }
    // NOTE: https://github.com/mozilla-comm/ical.js/issues/452
    finalEvent._status = pevent._firstProp("status");
    return finalEvent;
  }

  static traverseXML(doc, instruction) {
    for (const [key, path] of Object.entries(instruction)) {
      if (typeof instruction[key].isArray !== "function") {
        instruction[key] = [];
      }

      const nodes = select(path, doc);
      if (typeof nodes === "boolean" || typeof nodes === "number") {
        instruction[key] = nodes;
      }

      if (
        typeof nodes.isArray === "function" &&
        nodes.isArray() &&
        !nodes.length
      ) {
        instruction[key] = [];
        console.warn(`Couldn't find path from instruction: ${path}`);
      } else {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];

          if (node.nodeValue) {
            instruction[key].push(node.nodeValue);
          } else {
            instruction[key].push(node);
          }
        }
      }
    }

    return instruction;
  }

  // NOTE: Formatting to ical's special datetime means losing milli-second
  // precision!
  static formatDateTime(dateTime) {
    // NOTE: See https://tools.ietf.org/html/rfc5545 under:
    // "FORM #2: DATE WITH UTC TIME"
    // For explaination of the time zone shift below, visit:
    // https://stackoverflow.com/a/63227335/1263876
    const timeZone = "UTC";
    return format(utcToZonedTime(dateTime, timeZone), "yyyyMMdd'T'HHmmss'Z'", {
      timeZone
    });
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
    let hrefCount = 0;
    let etagCount = 0;
    let statusCount = 0;
    while (
      (hrefCount < values.href.length && etagCount < values.etag.length) ||
      statusCount < values.status.length
    ) {
      let resource = {};
      let [_, statusCode] = values.status[statusCount].match(
        new RegExp("HTTP\\/1\\.1 (\\d{3})")
      );
      statusCode = parseInt(statusCode, 10);
      resource.statusCode = statusCode;
      statusCount++;

      resource.href = values.href[hrefCount];
      hrefCount++;

      if (statusCode === 200 && values.etag[etagCount]) {
        resource.etag = values.etag[etagCount];
        etagCount++;
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
