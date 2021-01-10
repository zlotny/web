// DOM References
let body = document.body;
let stdout = document.getElementById("stdout");
let prompt = document.getElementById("prompt");
let console_prompt = document.getElementsByClassName("console-input")[0];
let command_line = document.getElementById("commandLine");

// Page events
console_prompt.addEventListener("keyup", inputHandler);
body.addEventListener("click", () => {
    console_prompt.focus();
});

// Globals
let terminal_stopped = false;
let history = [];
let positionInHistory = 0;

// Functions
function inputHandler(event) {
    event.preventDefault();
    switch (event.keyCode) {
        case 13:
            CLIInputHandler(String(console_prompt.value).replace("\n", ""));
            break;
        case 38:
            historyUp();
            break;
        case 40:
            historyDown();
            break;
        default:
            break;
    }
}

function CLIInputHandler(input) {
    history.push(input);
    positionInHistory = history.length;
    let args = input.split(" ");
    let command = String(args[0])
    let parameters = args.slice(1);

    // If string contains only spaces...
    if (!input.replace(/\s/g, '').length) {
        addToStdOut(input, "");
    } else {
        let output = outputForCommand(command, parameters);
        if (output != null) {
            addToStdOut(input, output);
        }
    }

    if (!terminal_stopped) {
        console_prompt.value = "";
    }

    window.scrollTo(0, body.scrollHeight);
}

function historyUp() {
    if (positionInHistory - 1 >= 0) {
        console_prompt.value = history[--positionInHistory];
    }
}

function historyDown() {
    if (positionInHistory + 1 < history.length) {
        console_prompt.value = history[++positionInHistory];
    }
}

function addToStdOut(command, text) {
    stdout.innerHTML += "\n" + prompt.outerHTML + " " + command + "\n" + String(text);
}

function outputForCommand(command, parameters) {
    toRet = "General I/O error";
    switch (command) {
        case "exit":
            toRet = cmdExit(parameters)
            break;
        case "help":
            toRet = cmdHelp(parameters)
            break;
        case "clear":
            toRet = cmdClear(parameters);
            break;
        case "history":
            toRet = cmdHistory(parameters);
            break;
        case "./about_myself":
            toRet = cmdAboutMyself(parameters)
            break;
        default:
            toRet = command + ": command not found";
            break;
    }
    return toRet;
}

function cmdExit(parameters) {
    let separator = "        ";
    let toRet = "\n\n";
    toRet += separator + "Process exited for the platform " + navigator.platform + " trough a web browser made by " + navigator.vendor;
    toRet += "\n\n";
    toRet += separator + "Thanks for passing by.";

    terminal_stopped = true;
    command_line.outerHTML = "";
    return toRet;
}

function cmdHelp(parameters) {
    s = "";
    s += "ndrs custom Bash. Version 1.0-release (web-js-multiarch)\n";
    s += "These shell commands are defined internally. Type `help` to see this list.\n";
    s += "\n"
    s += "\n"
    s += " <b>help</b>\t\t\t\tPrints this message.\n";
    s += " <b>clear</b>\t\t\t\tClears the screen and lets you with an empty prompt.\n";
    s += " <b>history</b>\t\t\tShows the command history.\n";
    s += " <b>exit</b>\t\t\t\tExits the terminal application.\n";
    s += "\n"
    s += "\n"
    s += "There's not a lot going in here. What did you expect?";
    return s;
}

function cmdClear(parameters) {
    stdout.innerText = "";
    return null;
}

function cmdHistory(parameters) {
    if (parameters.length == 0) {
        toRet = "";
        for (let counter = 0; counter < history.length; counter++) {
            toRet += counter + " " + history[counter] + "\n";

        }
        return toRet
    }
}

function cmdAboutMyself(parameters) {
    s = "\n\n";
    s += "Name: <b>Andrés Vieira</b>\n";
    s += "Nick(s): <i>ndrs, zlotny</i>\n";
    s += "Email: <a href=\"mailto:anvieiravazquez@gmail.com\">anvieiravazquez(at)gmail.com</a>\n";
    s += "\n";
    s += "I'm a full-stack software engineer, driven by passion, restless of learning.\n";
    s += "\n";
    s += "I just like computers, building stuff and learning new things. I'm also fond of refining\n";
    s += "my way of doing things.\n";
    s += "\n";
    s += "I'm from north-west Spain; I like videogames, motorcycles, gadgets and fantasy settings.\n";
    s += "I also have a pet cockatiel called Lelo.\n";
    s += "\n";
    s += "You can find me on:\n";
    s += "\n";
    s += "- <a target=\"_blank\" href=\"https://github.com/zlotny\">GitHub</a>\n";
    s += "- <a target=\"_blank\" href=\"https://linkedin.com/in/andrés-vieira-5393aaa4/\">LinkedIn</a>\n";
    s += "- <a target=\"_blank\" href=\"https://twitter.com/ndrs_\">Twitter</a>\n";
    s += "- <a target=\"_blank\" href=\"https://www.instagram.com/zlotny/\">Instagram</a>\n";
    s += "\n";
    s += ":)\n";
    s += "\n";
    s += "BTW, type <b>help</b> to fiddle a bit more if you want.\n\n";
    return s;
}

// Main execution block on browser load
function main() {
    let initial_command = "./about_myself";
    CLIInputHandler(initial_command);
}

window.onload = main;