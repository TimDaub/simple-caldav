# simple-caldav

[![npm version](https://badge.fury.io/js/simple-caldav.svg)](https://badge.fury.io/js/simple-caldav)

> caldav in JavaScript; made easy.

## Note on Completeness

The caldav and ICS specifications are large. Additionally, I'm not sure I ever
want to implement them completely. But I saw the need to a simple module that
works with e.g. [radicale](https://radicale.org/3.0.html) and provides decent
developer experience. simple-caldav is that attempt.

## Installation

```bash
$ npm i --save simple-caldav
```

## Usage

For now, see [tests](./test/index.test.js).

## Contributing

```bash
$ git clone git@github.com:TimDaub/simple-caldav.git
$ cd simple-caldav && npm i
$ npm run test
```

## Changelog

### 0.2.1

- Introduce new method for retrieving single events with `uid`: `getEvent(uid)`
- Parse and include `VALARM`s in `getEvent` and `listEvents`

### 0.2.0

- Removed `TraversalError` from code base entirely
- `listEvents` now returns an empty array when no events are found or an invalid
xml gets passed
- Instead of throwing `TraversalError`, `SimpleCalDAV.traverseXML` now returns
an empty array when path couldn't be found
- Added `getSyncToken` method to retrieve a sync token from a server
- Added `syncCollection` to receive a diff of an entire collection with a sync
token
- Added `ServerError` that is thrown when there are problems with the server

### 0.1.3

- Fix bug in VALARM construction

### 0.1.2

- Fix bug in VEVENT construction

### 0.1.1

- Allow adding VALARMS to VEVENTS

### 0.1.0

- Transform ical.js events to simple JSON objects and all customizable
transformation parameter on `listEvents` method

### 0.0.1

- Initial release

## License

[WIP]

## References

- 1: [Building a CalDAV Client](https://sabre.io/dav/building-a-caldav-client/)
- 2: [Radicale 3.0 Documentation: Command line client](https://radicale.org/3.0.html#documentation/supported-clients/command-line)
- 3: [iCalendar Validator](https://icalendar.org/validator.html)
- 4: [iCal specification](https://tools.ietf.org/html/rfc5545)
