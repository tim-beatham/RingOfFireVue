import { Server } from 'socket.io'
import { nanoid } from 'nanoid'

import gameRules from './data/rules.json'
import cardsJSON from './data/cards.json'

import _ from 'lodash'
import { io } from 'socket.io-client'

const UUID_LENGTH = 10


class Deck {
  constructor (gameRules) {
    this.gameRules = gameRules
    this.cards = [...cardsJSON.cards]
  }

  pickNextCard = () => {
    this.cards = _.shuffle(this.cards)
    
    let card = this.cards.pop()

    card.action = this.gameRules[card.code]

    return card
  }

  shuffleCards () {
    this.cards = _.shuffle(this.cards)
  }
}

class Game {
  constructor (gameName, host) {
    this.gameName = gameName
    this.host = host
    this.gameID = nanoid (UUID_LENGTH)
    this.players = [host]
    this.isPlaying = false
    this.currentPlayerIndex = 0
    this.deck = new Deck (gameRules)
  }

  nextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length
    return this.players[this.currentPlayerIndex]
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex]
  }

  addPlayer(player) {
    this.players.push(player)
  }

  startGame() {
    this.currentPlayerIndex = this._randomPlayerIndex()
    this.isPlaying = true
  }

  _randomPlayerIndex() {
    return Math.floor(Math.random() * this.players.length)
  }
}

const games = {}

/**
 * Sets up all the events for the socket.IO
 * server for the ring of fire back end.
 * @param {Server} socketServer 
 */
export default function createGameServer(socketServer) {
  socketServer.on('connection', (socket) => {
    console.log('someone connected luvly jubbly')

    socketServer.sockets.setMaxListeners(0)
    
    onCreateGame(socket, socketServer)
    onJoinGame(socket, socketServer)

    socket.on('disconnect', () => console.log('someone disconnected'))

  })
}

function onJoinGame(socket, io) {
  socket.on('joinGame', ({gameID, username}) => {
    let game = games[gameID]

    if (game === undefined) {
      socket.emit('invalidGame', gameID)
      return
    }
    
    game.addPlayer(username)

    socket.join(game.gameID)
    io.in(game.gameID).emit('userJoined', {players: game.players})

    console.log(`Player ${username} joined ${gameID}`)
    
    socket.emit('gameJoined', { gameName: game.gameName, username, 
      gameID, players: game.players})

    onNextRound(socket, io, gameID, username)
    onGetCard(socket, io, gameID, username)
  })
}

function onCreateGame(socket, io) {
  socket.on('createGame', ({gameName, hostName}) => {
    let game = new Game(gameName, hostName)
    socket.join(game.gameID)
    games[game.gameID] = game
    
    console.log(`Game ${game.gameID} created`)

    socket.emit('gameJoined', {gameName, username: hostName, 
      gameID: game.gameID, players: game.players})

    registerStartGameEvent(socket, io, game.gameID, hostName)
    onNextRound(socket, io, game.gameID, hostName)
    onGetCard(socket, io, game.gameID, hostName)
  })
}

function registerStartGameEvent(socket, io, gameID, username) {
  socket.on('startGame', () => {
    let game = games[gameID]
    
    if (game.host !== username)
      return
    
    game.startGame()

    io.in(gameID).emit('nextRound', game.getCurrentPlayer())
  });
}

function onNextRound(socket, io, gameID, username) {
  socket.on('nextRound', () => {
    let game = games[gameID]

    if (game.getCurrentPlayer() !== username)
      return

    io.in(gameID).emit('nextRound', game.nextPlayer())
  })
} 

function onGetCard(socket, io, gameID, username) {
  socket.on('getCard', () => {
    let game = games[gameID]

    // Prevent someone trying to cheat
    if (username !== game.getCurrentPlayer())
      return;
    
    // Get a random card
    let deck = game.deck;

    io.in(gameID).emit('pickedNextCard', { picker: username, card: deck.pickNextCard() })    
  })
}

