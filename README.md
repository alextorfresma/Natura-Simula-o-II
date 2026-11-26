# Simulação II

Simulador de distribuição de caixas com uma entrada e dois ramais. A geometria segue o Layout 03. As cotas de desenho orientam a aproximação das linhas de centro. A aplicação roda no navegador e calcula localmente.

## Executar

Com Node.js 22 ou superior, execute `npm run dev` e abra **http://localhost:4173**. Não há pacotes de terceiros para instalar. `PORT` e `HOST` permitem mudar o endereço de escuta.

Use **Iniciar** para acompanhar as caixas ou **Simular até o fim** para calcular o turno. **Entrada** aproxima o ponto de distribuição. **Configurar cenário** permite alterar velocidades, alimentação, duração, tempo inicial 50/50 e demanda de cada máquina. **Exportar CSV** salva as contagens por máquina no formato separado por ponto e vírgula.

## Modelo

- Demanda de referência de **83,4645 cx/min** com 21 máquinas ativas. A planilha de produção já inclui 5%. E18 e G22 compartilham a mesma demanda de referência e só uma saída fica ativa por vez.
- Caixa de **464 × 290 × 214 mm**. O avanço longitudinal ocupa 290 mm na entrada, com a caixa transversal à esteira, e 464 mm nos ramais, com a caixa alinhada à esteira.
- Alimentação padrão de 90 cx/min, velocidades de 60 m/min e ciclo de 3 segundos nas transferências para as máquinas, conforme os parâmetros de referência do projeto base.
- A divisão alterna os ramais durante a partida, cujo padrão é 120 segundos simulados. Depois, estima a cobertura de cada máquina pelo estoque, pelas caixas a caminho, pelo seu consumo e pelo tempo de percurso desde a divisão. A menor cobertura recebe prioridade. Se o ramal escolhido ficar indisponível, uma caixa pode seguir pelo outro. Se ambos ficarem indisponíveis, as caixas acumulam na entrada até abrir espaço.
- Cada máquina começa a contar seus ciclos de consumo após receber a primeira caixa. Uma falta é registrada quando chega a hora de consumir e o estoque está vazio. O modelo usa passo de 0,1 s, estoque finito, caixas sem ultrapassagem e contabilização de caixas admitidas, consumidas e em trânsito.
- Para calcular o comprimento dos trajetos e a capacidade de acúmulo, a planta foi redesenhada como linhas de centro em escala aproximada. O simulador representa estoque idealizado, sem folgas mecânicas, aceleração ou atrasos de sensores. O desvio de entrada é modelado sem atraso adicional configurado, separado do ciclo de transferência para cada máquina.

## Verificar

Execute `npm run check` e `npm test`. Os testes exercitam demanda e alternativas, partida 50/50, distribuição após a partida, capacidade de acúmulo, espera na entrada e conservação da contagem.
