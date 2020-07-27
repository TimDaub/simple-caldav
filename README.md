# simple-caldav

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
