
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CampusPass {
    struct Event {
        uint256 id;
        address organizer;
        string title;
        uint256 capacity;
        uint256 registeredCount;
        bool active;
    }

    uint256 public nextEventId = 1;

    mapping(uint256 => Event) public events;
    mapping(uint256 => mapping(address => bool)) public registered;
    mapping(uint256 => mapping(address => bool)) public attended;

    event EventCreated(
        uint256 indexed eventId,
        address indexed organizer,
        string title,
        uint256 capacity
    );

    event UserRegistered(
        uint256 indexed eventId,
        address indexed participant
    );

    event AttendanceMarked(
        uint256 indexed eventId,
        address indexed participant
    );

    function createEvent(
        string calldata title,
        uint256 capacity
    ) external returns (uint256) {
        require(bytes(title).length > 0, "Title required");
        require(capacity > 0, "Capacity must be positive");

        uint256 eventId = nextEventId++;

        events[eventId] = Event({
            id: eventId,
            organizer: msg.sender,
            title: title,
            capacity: capacity,
            registeredCount: 0,
            active: true
        });

        emit EventCreated(eventId, msg.sender, title, capacity);
        return eventId;
    }

    function registerForEvent(uint256 eventId) external {
        Event storage currentEvent = events[eventId];

        require(currentEvent.id != 0, "Event does not exist");
        require(currentEvent.active, "Event is inactive");
        require(!registered[eventId][msg.sender], "Already registered");
        require(
            currentEvent.registeredCount < currentEvent.capacity,
            "Event is full"
        );

        registered[eventId][msg.sender] = true;
        currentEvent.registeredCount++;

        emit UserRegistered(eventId, msg.sender);
    }

    function markAttendance(
        uint256 eventId,
        address participant
    ) external {
        Event storage currentEvent = events[eventId];

        require(currentEvent.id != 0, "Event does not exist");
        require(msg.sender == currentEvent.organizer, "Not organizer");
        require(registered[eventId][participant], "Not registered");
        require(!attended[eventId][participant], "Already attended");

        attended[eventId][participant] = true;

        emit AttendanceMarked(eventId, participant);
    }
}
