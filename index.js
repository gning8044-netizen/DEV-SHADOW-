/**
 * SHADOW-MD - Un Bot WhatsApp
 * Version : 1.0.0
 * Copyright (c) 2025 SHADOW TECH ™
 * 
 * ⚠️ Toute modification, redistribution ou utilisation sans autorisation explicite 
 * de l'auteur est strictement interdite.
 * Pour contact : +221763175367
 *
 * Ce programme est protégé et reste la propriété exclusive de SHADOW TECH ™
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Utilisation d’un store léger persistant au lieu de makeInMemoryStore (compatibilité entre versions) // SHADOW TECH ™
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Importation du store léger // SHADOW TECH ™
const store = require('./lib/lightweight_store')

// Initialisation du store // SHADOW TECH ™
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Optimisation mémoire - Forcer le garbage collection si disponible // SHADOW TECH ™
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Nettoyage mémoire effectué') // SHADOW TECH ™
    }
}, 60_000) // toutes les 1 minute

// Surveillance mémoire - Redémarrer si RAM trop élevée // SHADOW TECH ™
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM trop élevée (>400MB), redémarrage du bot...') // SHADOW TECH ™
        process.exit(1) // Le panel redémarrera automatiquement // SHADOW TECH ™
    }
}, 30_000) // vérifier toutes les 30 secondes

let phoneNumber = "221763175367"
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "SHADOW-BOT"
global.themeemoji = "•"
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Créer l'interface readline uniquement si l'environnement est interactif // SHADOW TECH ™
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // Dans un environnement non interactif, utiliser ownerNumber depuis settings // SHADOW TECH ™
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}


async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Sauvegarder les identifiants lors de leur mise à jour // SHADOW TECH ™
        XeonBotInc.ev.on('creds.update', saveCreds)

    store.bind(XeonBotInc.ev)

    // Gestion des messages // SHADOW TECH ™
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Bloquer les messages privés en mode privé, autoriser les groupes // SHADOW TECH ™
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear() // Nettoyer le cache pour éviter les problèmes mémoire // SHADOW TECH ™
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Erreur dans handleMessages :", err) // SHADOW TECH ™
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ Une erreur est survenue lors du traitement de votre message.',  // SHADOW TECH ™
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363401545196668@newsletter',
                                newsletterName: 'SHADOW-MD',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Erreur dans messages.upsert :", err) // SHADOW TECH ™
        }
    })

// Décodage des JID // SHADOW TECH ™
XeonBotInc.decodeJid = (jid) => {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
        let decode = jidDecode(jid) || {}
        return decode.user && decode.server && decode.user + '@' + decode.server || jid
    } else return jid
}

XeonBotInc.ev.on('contacts.update', update => {
    for (let contact of update) {
        let id = XeonBotInc.decodeJid(contact.id)
        if (store && store.contacts) store.contacts[id] = { id, name: contact.notify } // SHADOW TECH ™
    }
})

// Décodage et récupération du nom (corrigé, async, optimisé) // SHADOW TECH ™
XeonBotInc.getName = async (jid, withoutContact = false) => {
    const id = XeonBotInc.decodeJid(jid)
    withoutContact = XeonBotInc.withoutContact || withoutContact

    try {
        // Si groupe
        if (id.endsWith("@g.us")) {
            let v = store.contacts[id] || {}

            if (!(v.name || v.subject)) {
                try {
                    const metadata = await XeonBotInc.groupMetadata(id).catch(() => ({}))
                    v = metadata || v
                } catch {}
            }

            const name = v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international')
            return withoutContact ? '' : name
        }

        // Si contact normal
        let v = id === '0@s.whatsapp.net'
            ? { id, name: 'WhatsApp' }
            : (id === XeonBotInc.decodeJid(XeonBotInc.user?.id)
                ? XeonBotInc.user
                : (store.contacts[id] || {}))

        const name = (withoutContact ? '' : v.name)
            || v.subject
            || v.verifiedName
            || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international')

        return name

    } catch (e) {
        return withoutContact ? '' : (store.contacts[id]?.name || id)
    }
}

XeonBotInc.public = true

XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

// Gestion du code de jumelage // SHADOW TECH ™
if (pairingCode && !XeonBotInc.authState.creds.registered) {
    if (useMobile) throw new Error('Impossible d’utiliser le code de jumelage avec l’API mobile') // SHADOW TECH ™

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Veuillez saisir votre numéro WhatsApp 😍\nFormat: 221763175367 (sans + ou espaces) : `))) // SHADOW TECH ™
        }

        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Numéro invalide. Veuillez entrer votre numéro complet international sans + ou espaces.')); // SHADOW TECH ™
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Votre code de jumelage : `)), chalk.black(chalk.white(code))) // SHADOW TECH ™
                console.log(chalk.yellow(`\nVeuillez entrer ce code dans votre application WhatsApp :\n1. Ouvrez WhatsApp\n2. Allez dans Paramètres > Appareils liés\n3. Appuyez sur "Lier un appareil"\n4. Entrez le code affiché ci-dessus`)) // SHADOW TECH ™
            } catch (error) {
                console.error('Erreur lors de la demande du code de jumelage :', error) // SHADOW TECH ™
                console.log(chalk.red('Impossible d’obtenir le code de jumelage. Vérifiez votre numéro et réessayez.')) // SHADOW TECH ™
            }
        }, 3000)
    }

    // Gestion des connexions // SHADOW TECH ™
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        
        if (qr) {
            console.log(chalk.yellow('📱 QR Code généré. Veuillez scanner avec WhatsApp.')) // SHADOW TECH ™
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connexion à WhatsApp...')) // SHADOW TECH ™
        }
        
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connecté à => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, {
    text: `🚀 Bot bi connecté na deh !\n\n🕒 Heure actuelle : ${new Date().toLocaleString()}\n✅ Statut : En ligne et fonctionnel !\n\n🔔 Boul faté rejoindre sama canal dmrm gua rék !`, // SHADOW TECH ™
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363401545196668@newsletter',
                            newsletterName: 'SHADOW MD',
                            serverMessageId: -1
                        }
                    }
                });
            } catch (error) {
                console.error('Erreur lors de l’envoi du message de connexion :', error.message) // STIVO TECH ™
            }

            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'SHADOW BOT'} ]`)}\n\n`))
            console.log(chalk.cyan(`
< ================================================== >

   ████████╗████████╗██╗   ██╗██╗   ██╗ ██████╗ 
   ╚══██╔══╝╚══██╔══╝██║   ██║██║   ██║██╔═══██╗
      ██║      ██║   ██║   ██║██║   ██║██║   ██║
      ██║      ██║   ██║   ██║██║   ██║██║   ██║
      ██║      ██║   ╚██████╔╝╚██████╔╝╚██████╔╝
      ╚═╝      ╚═╝    ╚═════╝  ╚═════╝  ╚═════╝ 
                                                
< ================================================== >
`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} YOUTUBE CHANNEL: shadowtech`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: SHADOW-DEVX`))
            let ownerData = JSON.parse(fs.readFileSync('./data/owner.json')) // SHADOW TECH ™
let ownerNumber = Array.isArray(ownerData) ? (ownerData[0]?.number || ownerData[0]) : (ownerData.number || ownerData)
if (typeof ownerNumber === 'object') ownerNumber = String(ownerNumber)
const ownerJid = (ownerNumber || phoneNumber) + '@s.whatsapp.net' // SHADOW TECH ™

console.log(chalk.magenta(`• OWNER NUMBER: ${ownerNumber}`)) // SHADOW TECH ™
            console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: SHADOW TECH THE REBIRTH`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot connecté na deh do nite ! ✅`))
            console.log(chalk.blue(`Version du bot: ${settings.version}`)) // SHADOW TECH ™
        }
      if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            const statusCode = lastDisconnect?.error?.output?.statusCode
            
            console.log(chalk.red(`Connexion fermée à cause de ${lastDisconnect?.error}, reconnexion ${shouldReconnect}`)) // SHADOW TECH ™
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    rmSync('./session', { recursive: true, force: true })
                    console.log(chalk.yellow('Dossier de session supprimé. Veuillez vous réauthentifier.')) // SHADOW TECH ™
                } catch (error) {
                    console.error('Erreur lors de la suppression de la session :', error) // SHADOW TECH ™
                }
                console.log(chalk.red('Session déconnectée. Veuillez vous réauthentifier.')) // SHADOW TECH ™
            }
            
            if (shouldReconnect) {
                console.log(chalk.yellow('Reconnexion...')) // SHADOW TECH ™
                await delay(5000)
                startXeonBotInc()
            }
        }
    })

    // Suivi des appels récents pour éviter le spam // SHADOW TECH ™
    const antiCallNotified = new Set();

    // Gestion anti-call : bloquer les appelants si activé // SHADOW TECH ™
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // Première étape : tenter de rejeter l’appel si possible // SHADOW TECH ™
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notifier l’appelant une seule fois dans une courte période // SHADOW TECH ™
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Anti-call activé. Votre appel a été rejeté et vous serez bloqué.' });  // SHADOW TECH ™
                    }
                } catch {}
                // Puis : bloquer après un court délai pour s’assurer que le rejet et le message sont traités // SHADOW TECH ™
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignorer // SHADOW TECH ™
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update); // SHADOW TECH ™
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m); // SHADOW TECH ™
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status); // SHADOW TECH ™
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status); // SHADOW TECH ™
    });

    return XeonBotInc
    } catch (error) {
        console.error('Erreur dans startXeonBotInc :', error) // SHADOW TECH ™
        await delay(5000)
        startXeonBotInc()
    }
}


// Démarrage du bot avec gestion des erreurs // SHADOW TECH ™
startXeonBotInc().catch(error => {
    console.error('Erreur fatale :', error)// SHADOW TECH ™
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Exception non interceptée :', err) // SHADOW TECH ™
})

process.on('unhandledRejection', (err) => {
    console.error('Rejet non géré :', err) // SHADOW TECH ™
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Mise à jour de ${__filename}`)) // SHADOW TECH ™
    delete require.cache[file]
    require(file)
})