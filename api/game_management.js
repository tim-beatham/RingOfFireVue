import { Server } from 'socket.io'
import { nanoid } from 'nanoid'

import gameRules from './data/rules.json'
import cardsJSON from './data/cards.json'

import _ from 'lodash'
import { io } from 'socket.io-client'

/*
 * This JS file handles the game logic for the Ring Of Fire
 * web application. 
 * 
 * To set up the Socket.IO events we need to call createGameServer
 * passing the instance of the Socket.IO server instance from another
 * JS module.
*/

// Represents the length of the unique identifier.
const UUID_LENGTH = 10


/**
 * Represents a for 
 * particular deck.
 * 
 * Stores the cards that the deck
 * contains as well as the rules for
 * the game.
 */
class Deck {
  /**
   * To instantiate a deck we
   * need a list of the game rules.
   * The rules map a card to an action
   * to be performed.
   * 
   * @param {Array} gameRules 
   */
  constructor (gameRules) {
    this.gameRules = gameRules
    this.cards = [...cardsJSON.cards]
  }

  /** 
    * Shuffles the list of cards and picks and removes the end element.
    * @return {Object} Returns a card object with attributes: 'href', 'title' and 'code.
  */  
  pickNextCard () {
    this.cards = _.shuffle(this.cards)
    
    let card = this.cards.pop()

    card.action = this.gameRules[card.code]

    return card
  }
}

/** 
 * Represents a single game instance.
 * Each user in the Game is subscribed to the
 * room as specified by the gameID attribute.
 * 
 * Associated with a Game is a deck with the 
 * given game rules stored in the deck.
 * 
 * In future verisons I plan to allow the user
 * to specify the game rules to use.
 */
class Game {

  /**
   * To construct an instance of a Game requires
   * the name of the given game and the username of the
   * host 'hosting' the game.
   * 
   * @param {*} gameName      the name of the game instance. This does not uniquely identify the game. 
   * @param {*} host          the username of the host in the game.
   */
  constructor (gameName, host) {
    this.gameName = gameName
    this.host = host

    // We need to generate a unique identifier for the game.
    // This will be used for players to use to identifer the game and join it.
    this.gameID = nanoid (UUID_LENGTH)
    
    this.players = [host]
    
    this.isPlaying = false
    
    // Identifiers the player whos turn it is.
    this.currentPlayerIndex = 0

    this.deck = new Deck (gameRules)
  }

  /**
   * Changes the user's turn to the next turn
   * of the user. 
   * 
   * @return {string}           returns the username of the player whos turn it is.
   */
  nextPlayer() {
    // Use mod so we can wrap around to the next player.
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length
    return this.players[this.currentPlayerIndex]
  }

  /**
   * Gets the username of the current player.
    * @return {string}          gets the username of the current player.
   */
  get currentPlayer() {
    return this.players[this.currentPlayerIndex]
  }

  /**
   * @return {Number}           the numbers of players  
   */
  get numPlayers() {
    return this.players.length
  }

  /**
   * Adds a player to the game with the given user/
   * @param {string} player 
   */
  addPlayer(player) {
    if (this.isPlaying == true)
      throw new Error('attempted to add a player when the game has already started')
    
    if (this.players.indexOf(player) !== -1)
      throw new Error('user is already in the game')
      
    this.players.push(player)
  }

  /**
   * Starts the game. Randomly picks a player and starts
   * the game.
   */
  startGame() {
    this.currentPlayerIndex = this._randomPlayerIndex()
    this.isPlaying = true
  }

  /**
   * Picks a random player index. This is used to find
   * the person whos go it is.
   * 
   * @return {Number}         the randomly selected index.
   */
  _randomPlayerIndex() {
    return Math.floor(Math.random() * this.players.length)
  }

  /**
   * Removes the player from the room.
   */
  removePlayer (username) {
    let indexOfPlayer = this.players.indexOf(username)

    if (indexOfPlayer !== -1) {
      this.players.splice(indexOfPlayer, 1)
    }
  }

  /**
    * Select another user as the host.
    * Presumes that the new host has been removed
    * from the game.
    * 
    * @return         the username of the new host
    */
  calcHost () {
    this.host = this.players[0]
    return this.host
  }
}

/*
 * Contains all the games currently in play.
 * Maps the game by it's gameID.
 */
const games = {}

/**
 * Sets up all the events for the socket.IO
 * server that serves the ring of fire back end.
 * 
 * @param {Server} socketServer       the instance of the Socket.IO server. 
 */
export default function createGameServer(socketServer) {
  socketServer.on('connection', (socket) => {
    console.log(`A Socket Connected!`)

    // Did this on the Vue side as I was getting error messages/
    socketServer.sockets.setMaxListeners(0)
    
    // Set up all the events for a user that has created the game.
    onCreateGame(socket, socketServer)

    // Set up all the events for a user that has joined the game.
    onJoinGame(socket, socketServer)


    // When a user disconnects log the disconnection.
    socket.on('disconnect', () => console.log('someone disconnected'))

  })
}

/**
 * Sets up the event for a user joining the game.
 * 
 * @param {Socket} socket           the user's Websocket    
 * @param {Server} io                    the instance of the Server socket.
 */
function onJoinGame(socket, io) {
  socket.on('joinGame', ({gameID, username}) => {
    // Get the gameID of the game the user is attempting to join.
    let game = games[gameID]

    // Is this is invalid return an invalid game response.
    if (game === undefined) {
      socket.emit('invalidGame', gameID)
      return
    }
    
    // TODO: Insert duplicate username error here.

    // Otherwise add the player to the game.
    game.addPlayer(username)

    // Join the socket to the given game room.
    socket.join(game.gameID)

    // Broadcast that the user joined to the room/
    io.in(game.gameID).emit('userJoined', {players: game.players})

    // Log that the user joined the given game.
    console.log(`Player ${username} joined ${gameID}`)
    
    // Emit gameJoined directly to the user that joined giving
    // the details about the room that they joined.
    socket.emit('gameJoined', { gameName: game.gameName, username, 
      gameID, players: game.players})

    // Only the user can start a game so register that event to them.
    // Which we want to do this in case the host leaves the game...
    registerStartGameEvent(socket, io, game.gameID, username)

    // Attatch the events for the next round.
    onNextRound(socket, io, gameID, username)
    
    // Attach the events for the user picking a given card.
    onGetCard(socket, io, gameID, username)

    onLeaveRoom(socket, io, game.gameID, username)
  })
}

/**
 * Attatch the events for the user creating
 * a game.
 * 
 * @param {Socket} socket 
 * @param {Server} io 
 */
function onCreateGame(socket, io) {
  socket.on('createGame', ({gameName, hostName}) => {

    // Create a game that giving the name of the game and the host.
    let game = new Game(gameName, hostName)

    // Subscribe the host to the room.
    socket.join(game.gameID)

    // Attatch the game to the games map.
    games[game.gameID] = game
    
    console.log(`Game ${game.gameID} created`)


    // Give the details of the room to the host.
    socket.emit('gameJoined', {gameName, username: hostName, 
      gameID: game.gameID, players: game.players})
    
    // Only the user can start a game so register that event to them.
    registerStartGameEvent(socket, io, game.gameID, hostName)

    // Register the next round event.
    onNextRound(socket, io, game.gameID, hostName)
    
    // Register the user getting a card event.
    onGetCard(socket, io, game.gameID, hostName)

    onLeaveRoom(socket, io, game.gameID, hostName)
  })
}

/**
 * Register the event of the host starting the game.
 * There is no need to perform validation because all 
 * the validation is done when the user asks to create a 
 * game.
 * 
 * @param {Socket} socket         the host's socket
 * @param {Server} io             the server's socket
 * @param {String} gameID         the game UUID
 * @param {String} username       the username of the host
 */
function registerStartGameEvent(socket, io, gameID, username) {
  socket.on('startGame', () => {
    // Get the game of the host.
    let game = games[gameID]
    
    // Start the game.
    game.startGame()

    // Emit that the game has started to all the users subscribed to the game.
    io.in(gameID).emit('nextRound', game.currentPlayer())
  });
}

/**
 * Registers the next round event.
 * When a player asks for the next round
 * we need to check if it is there go and if 
 * it is emit the next round passing the next
 * player whose turn it is.
 * 
 * @param {Socket} socket             the client's socket               
 * @param {Server} io                 the server socket
 * @param {String} gameID             the string that uniquely identifies the game
 * @param {String} username           the username of the client whose turn it was.
 */
function onNextRound(socket, io, gameID, username) {
  socket.on('nextRound', () => {
    let game = games[gameID]

    if (game.currentPlayer() !== username)
      return

    io.in(gameID).emit('nextRound', game.nextPlayer())
  })
} 

/**
 * When the user attempts to get a card
 * make sure it is their turn and broadcast 
 * the card that they picked to all users.
 * 
 * 
 * @param {Socket} socket       the client's socket
 * @param {Server} io           the server's socket
 * @param {String} gameID       the game UUID 
 * @param {String} username     the client's username
 */
function onGetCard(socket, io, gameID, username) {
  socket.on('getCard', () => {
    let game = games[gameID]

    // Prevent someone trying to cheat
    if (username !== game.currentPlayer())
      return;
    
    // Get a random card
    let deck = game.deck;

    io.in(gameID).emit('pickedNextCard', { picker: username, card: deck.pickNextCard() })    
  })
}

/**
 * When the client either disconnects
 * or emits that they would like to leave
 * the room then remove them from the group
 * and emit this to all users. 
 * 
 * @param {Socket} socket 
 * @param {Server} io 
 * @param {String} gameID 
 * @param {String} username 
 */
function onLeaveRoom(socket, io, gameID, username) {
  socket.on('disconnect', () => {
    let game = games[gameID]

    game.removePlayer(username)

    io.in(gameID).emit('userLeft', { players: game.players, host: game.calcHost()})
    console.log(`${username} left ${gameID}`)
    console.log(game.players)

    if (game.numPlayers == 0) {
      delete games[gameID]
    }
  })
}
