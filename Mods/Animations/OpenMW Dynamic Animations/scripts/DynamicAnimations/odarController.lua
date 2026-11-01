local oSelf = require("openmw.self")
local anim = require("openmw.animation")
local I = require("openmw.interfaces")
local async = require("openmw.async")
--	local aux_util = require("openmw_aux.util")
local core = require("openmw.core")
local types = require("openmw.types")

local logSpam = false
local disabled = false
local playBlendedHandlers = {}

local L = {
	controls = oSelf.controls,
	getCurrentSpeed = types.Actor.getCurrentSpeed,
	getStance = types.Actor.getStance,
	STANCE_Nothing = types.Actor.STANCE.Nothing
}

local logLevel = 0
--local function debug(m)
--	if logLevel > 0  then		print(m)		end
--end

local function onPlayBlendedAnimation(groupname, options)    
    for i = #playBlendedHandlers, 1, -1 do
        local h = playBlendedHandlers[i].FN(groupname, options)
        if type(options.newGroupName) == "string" then
            groupname = options.newGroupName
            options.newGroupName = nil
        end
        if h == false then
            return groupname
        end
    end
    return groupname
end

local spamNames = { ["torch"] = true, ["idle1h"] = true, ["idle2c"] = true, ["idlehh"] = true }

local function playBlendedAnimation(groupname, options)
    if disabled then		return		end
    options = options or {}
    if logLevel > 1 then
        if not spamNames[groupname] then
            print(groupname, options.priority, options.blendMask)
        else
            if not logSpam then
                logSpam = true
                print(groupname, options.priority, options.blendMask)
            end
	end
    end
    local swap = onPlayBlendedAnimation(groupname, options)

    -- if logLevel > 1 then print(aux_util.deepToString(options)) end
    if options.skip then
        return
    end

    if swap ~= groupname then
        anim.playBlended(oSelf, swap, options)
        options.skip = true
        return false
    end

end

I.AnimationController.addPlayBlendedAnimationHandler(playBlendedAnimation)


local update, updateHandlers
local odarScripts = {}

local API = {}
API.handlers = { onUpdate = {n=0}, onInit = {}, onActive = {}, onSecond = {}, AIChange = {} }
API.scripts = {
	rebootAI = function()
		local p = I.AI.getActivePackage()
		if p and p.type == "Wander" and anim.getActiveGroup(oSelf, 0) == "idle" then
			I.AI.startPackage(p)
		end
	end
}
API.events = { odarEnabled = {}, rebootAI = { API.scripts.rebootAI }, updateAI = {} }
API.runHandlers = function(h, e)
	if h.runFirst then	h.runFirst(e)		end
	for i = #h, 1, -1 do	h[i](e)			end
end
API.findActiveHandlers = function()
	local h = { n = 0 }
	for _, v in ipairs(API.handlers.onUpdate) do
		if v.active then
			h.n = h.n + 1			h[h.n] = v
		end
	end
	updateHandlers = h.n > 0 and h
end


function API.addHandler(k, fn, name)
	local h = API.handlers[k] or API.events[k]
	if type(h) ~= "table" or not fn then
		return
	end
	if k == "onUpdate" then
		fn = { FN = fn, name = name, active = true, update = API.findActiveHandlers }
		fn.update()
	end
	h[#h + 1] = fn			h.n = h.n and #h or nil
	return fn
end

API.odarEnabled = function(e)
	if not core.isWorldPaused() then	return		end
	disabled = not e
	API.runHandlers(API.events.odarEnabled, e)
	if disabled then
		update = nil		updateHandlers = nil
	else
		API.findActiveHandlers()
	end
end

local AI = { anim = {}, type = "checkState" }
API.checkState = function()
	local p = I.AI.getActivePackage() or {}
	if p.type ~= AI.type then
		AI = { type=p.type, distance=p.distance, idle=p.idle, anim={},
			actor=oSelf.object, sendUpdate=true }
	end
	if AI.stance ~= L.getStance(oSelf) then
		local s = L.getStance(oSelf)
		AI.sendUpdate = AI.sendUpdate or AI.stance == L.STANCE_Nothing or s == L.STANCE_Nothing
		AI.stance = s
	end
end
API.events.updateAI.runFirst = API.checkState

API.sendUpdate = function()
	if AI.sendUpdate then
		AI.sendUpdate = nil
		AI.anim[0] = anim.getActiveGroup(oSelf, 0)
		API.runHandlers(API.handlers.AIChange, AI)
		core.sendGlobalEvent("odar_updateActor", AI)
	end
end
API.addHandler("updateAI", API.sendUpdate)
API.addHandler("onSecond", API.sendUpdate)

API.updateTimer = function()
	async:newUnsavableSimulationTimer(disabled and 2 or 1, API.updateTimer)
--	print(core.getSimulationTime())
	logSpam = false
	API.checkState()
	API.runHandlers(API.handlers.onSecond)
--	if disabled and updateHandlers then
--		API.runHandlers(updateHandlers, 0.05)
--	end
end
async:newUnsavableSimulationTimer(math.random(20) / 20, API.updateTimer)

API.addScript = function(file, data)
	file = file:lower()		if odarScripts[file] then	return		end
--	print("reg", file)
	local m = require(file)		odarScripts[file] = true
	if not m then		return		end

	if AI.type == "checkState" then		API.checkState()	end
	if m.engineHandlers then
		for k, v in pairs(m.engineHandlers) do	
			API.addHandler(k, v, m.interfaceName)
			if k == "onInit" and data then	v(data)		end
		end
	end
	if m.eventHandlers then
		for k, v in pairs(m.eventHandlers) do
			-- print(k)
			local h = API.events[k]
			if not h then
				h = {}		API.events[k] = h
			end
			h[#h + 1] = v
		end
	end
	if m.interface then
		local i = {}		API.scripts[m.interfaceName] = i
		for k, v in pairs(m.interface) do
			-- print(k)
			i[k] = v
		end
	end
end

local function onUpdate(dt)
	if dt <= 0 or not(update or updateHandlers) then
		return
	end

	if updateHandlers then
		for i = updateHandlers.n, 1, -1 do
			if updateHandlers[i].active then
				updateHandlers[i].FN(dt)
			end
		end
	end
	if not update then		return		end

	if update.maxTurn then
		local yaw = L.controls.yawChange
		if yaw ~= 0 then
	--		debug("Yaw change " .. yaw)
			local max = update.maxTurn * dt
			if yaw > max then
				L.controls.yawChange = max
			elseif yaw < -max then
				L.controls.yawChange = -max
			end
		end
	end
	if update.playing then
		local s = L.getCurrentSpeed(oSelf)
		if math.abs(s - update.actorSpeed) > 1 then
	--		debug("New speed " .. s)
			update.actorSpeed = s
			anim.setSpeed(oSelf, update.playing, math.min(update.maxSpeed, s) / update.velocity)
		end
		if s == 0 then
	--		debug("STOPPED")
			update.actorSpeed = 0		update.callback()
		end
	end
end

-- print("ODAR RELOADING")
-- I.OnUpdate.addHandler(onUpdate)

return {
	engineHandlers = {
		onUpdate = onUpdate,
		onActive = function()		API.runHandlers(API.handlers.onActive)		end
--		onLoad = function() print("ODAR ONLOAD")		end
	},
	eventHandlers = {
		odarEnabled = API.odarEnabled,
		odarAddScript = function(e)
			e = (type(e) == "table" and e) or (type(e) == "string" and { e }) or {}
			for _, file in ipairs(e) do
				API.addScript(file, e.initData)
			end
		end,
		odarEvent = function(e)
			if e.event and API.events[e.event] then
				API.runHandlers(API.events[e.event], e)
			end
		end,
		initNPCdiag = function()
			API.runHandlers(API.events.odarEnabled, false)
		end,
		closeNPCdiag = function()
			API.runHandlers(API.events.odarEnabled, not disabled)
		end,
		PlayBlendedAnimation = function(e)
			I.AnimationController.playBlendedAnimation(e.groupName, e.options)
			return false
		end,
		CancelAnimation = function(e)
			anim.cancel(oSelf, e)
		end,
		RemoveVfx = function(e)		anim.removeVfx(oSelf, e)		end,
	},

	interfaceName = "ODAR",
	interface = {
		version = 115,
		playBlendedAnimation = function(g, o)
			playBlendedAnimation(g, o)
		end,
		addPlayBlendedAnimationHandler = function(handler, name)
			name = type(name) == "string" and name or tostring(#playBlendedHandlers + 1)
			playBlendedHandlers[#playBlendedHandlers + 1] = {name=name, FN=handler}
			if logLevel > 0 then
				print("ODAR handler "..name.." registered.")
			end
		end,

		addEventHandler = function(e, fn, name)
			return API.addHandler(e, fn, name)
		end,
		getAIStatus = function()	return AI		end,
		selfControls = function(e)
			if e == nil then
				return update and next(update) ~= nil
			end
			if update and update.callback then
				update.callback()
			end
			update = type(e) == "table" and e or nil
		end,

		rebootAI = API.scripts.rebootAI,
		logLevel = function(e)
			logLevel = type(e) == "number" and e or logLevel
			print("Logging level "..logLevel)
		end,
		enabled = API.odarEnabled,
--[[
		-- Debugging access
		scripts = API.scripts,
		api = API,
		update = function()	return update		end,
		events = API.events,
		list = function() print(#playBlendedHandlers, #odarScripts)		end,
--]]
	}
}
