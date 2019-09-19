let console_prompt = document.getElementsByClassName('console-input')[0];

console_prompt.addEventListener("keyup", (event) => {
    event.preventDefault();
    if (event.keyCode === 13) {
        let command = console_prompt.value;
        console_prompt.value = "";
        console.log("Introduced command was: " + String(command));
    }
});