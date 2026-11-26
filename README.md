# Simulação II · Layout 03

Simulador de distribuição de caixas baseado na interface FBRA. A referência é o Layout 03, com uma entrada e dois ramais de distribuição. Vinte e uma máquinas usam os consumos da planilha, totalizando **83,4645 cx/min** com a margem de 5% incluída. E18 e G22 são saídas alternativas de uma mesma linha.

## Executar

Com Node.js 22 ou superior, execute `npm run dev` e abra **http://localhost:4173** nesse computador. A aplicação estática não exige instalação de bibliotecas. O servidor também aceita as variáveis `PORT` e `HOST`.

## Usar o simulador

- Na tabela de linhas, marque as máquinas que devem rodar. Ajuste níveis de acúmulo em caixas, respeitando 1 ≤ mínimo < máximo ≤ capacidade.
- Selecione o estoque inicial e a condição de liberação das máquinas. Consumo e faltas são contabilizados depois da liberação de cada máquina.
- Programa-se uma parada pela planta, definindo local, distância, início e duração. A principal, os dois ramais de distribuição, cada trecho até uma máquina e cada transferência podem ser bloqueados. O relógio inclui o tempo de enchimento. Máquinas liberadas continuam consumindo sua reserva.
- **Simular produção** calcula o período. Na planta, ajuste a posição e velocidade da reprodução. Os gráficos mostram o período inteiro ou a janela escolhida. Os cartões por linha mostram caixas no ramal e consumidas no instante da reprodução.
- Exporte os resultados, a série de produção, o estoque ou as ocorrências em CSV. Cenários salvos ficam neste navegador e também podem ser exportados em JSON.

## Regras e limites

A caixa de **464 × 290 × 214 mm** ocupa 290 mm no sentido do avanço na principal e 464 mm nos ramais. A planta indica o sentido com setas. Os três trechos longos cotados usam os comprimentos de 53,5607 m, 31,3373 m e 28,138 m do Layout 03. Os demais comprimentos são aproximados pelas linhas de centro do desenho. Os sensores são referências de pré-dimensionamento.

A partida alterna entre os transportadores superior e inferior. Se um estiver indisponível, a caixa segue pelo outro. No pré-enchimento global, as caixas são reservadas em rodízio para as máquinas ativas de cada percurso até o máximo configurado. Depois de completar os acúmulos, a alimentação completa a reserva da entrada e dos dois transportadores ativos. As máquinas começam a consumir somente após essa etapa. Depois disso, a divisão acompanha o consumo total das máquinas ativas em cada transportador. As caixas permanecem no fluxo até passarem pela transferência de uma máquina que precise de reposição. Esse instante é calculado e exibido no resultado. Se o cenário não atingir essa condição, o aviso indica que o ensaio terminou em partida. Cada modo de liberação determina separadamente quando as máquinas podem começar a consumir.

Como no FBRA, a chamada de reposição abre ao atingir o mínimo e fecha ao atingir o máximo. No modo intercalado, cada transferência segue a cadência de consumo com a margem de recuperação configurada. Quando a alimentação nominal é inferior à demanda total, a cadência também é limitada à parcela proporcional de cada máquina. Caixas em trânsito no ramal contam para a capacidade física. A animação acompanha a identidade da caixa ao longo de cada trecho, sempre no sentido de avanço. Paradas bloqueiam na posição configurada, mantendo movimento a jusante. Os ensaios usam passo de 0,1 s e registram o histórico em intervalos informados nos gráficos.

A geometria dupla de referência é fixa no editor da versão atual. O editor FBRA continua disponível para criar desenhos independentes com uma única principal. As áreas de acúmulo, a configuração de produção e as posições de parada do Layout 03 são editáveis na interface.

## Verificar

Execute `npm run check` e `npm test`. Os testes cobrem as condições de partida, as paradas, os níveis e a seleção por máquina, a conservação das caixas, os dados dos gráficos e a interação com a interface via DOM simulado.
